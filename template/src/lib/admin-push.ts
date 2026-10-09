/**
 * Web push для админки: подписки устройств, outbox-доставки событий
 * (AdminEvent → AdminPushDelivery) и транспорт отправки.
 *
 * Правила:
 * - записи доставки создаются в той же транзакции, что и событие (см. admin-events.ts);
 * - быстрая попытка после коммита — через after() в роутах, дожим — job push-delivery;
 * - endpoint и криптоключи подписок не логируются: только коды ошибок и счётчики;
 * - 404/410 от провайдера означают протухшую подписку — отзываем её.
 */
import { after } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";

export type PushPayload = {
  eventId: string;
  kind: "order" | "booking";
  reference: string; // id заказа/брони — клиент строит цель из проверенной пары
  label: string; // служебный минимум: «Заказ №123» / «Бронь 10 октября»
};

export type PushTransport = {
  send(subscription: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<void>;
};

export const MAX_PUSH_ATTEMPTS = 8;
export const PUSH_EVENT_TTL_MS = 24 * 3600_000; // старше суток событие не доставляем
export const PUSH_DELIVERY_TTL_MS = 7 * 24 * 3600_000; // cleanup завершённых доставок
const STALE_SENDING_MS = 10 * 60_000; // «зависшие» sending возвращаются в очередь

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 30 * 60_000;

/** Пауза перед следующей попыткой: 30 с, рост ×2, потолок 30 минут. */
export function pushBackoffMs(attempts: number): number {
  if (attempts <= 1) return BACKOFF_BASE_MS;
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_CAP_MS);
}

const SAFE_REFERENCE = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * Цель уведомления из ПРОВЕРЕННОЙ пары kind+reference (обе величины — из нашей БД,
 * payload не доверяем). null — показывать без перехода.
 */
export function buildPushTarget(kind: string, reference: string): string | null {
  if (kind !== "order" && kind !== "booking") return null;
  if (!SAFE_REFERENCE.test(reference)) return null;
  return kind === "order" ? `/admin?selected=${reference}` : `/admin/bookings?selected=${reference}`;
}

export type PushErrorCode = "gone" | "timeout" | "server" | "network";

/** Безопасный код ошибки: без endpoint, ключей и тел ответов. */
export function pushErrorCode(error: unknown): PushErrorCode {
  const status = (error as { statusCode?: unknown })?.statusCode;
  if (status === 404 || status === 410) return "gone";
  if (typeof status === "number" && status >= 500) return "server";
  const code = (error as { code?: unknown })?.code;
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return "timeout";
  return "network";
}

export const DEFAULT_VAPID_SUBJECT = "mailto:push@fkuss.ru";

/** Включено, когда задана пара ключей. NEXT_PUBLIC_* не используем: образ общий, ключи — per-site. */
export function isPushConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim());
}

export function getVapidConfig(env: Record<string, string | undefined> = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: env.VAPID_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT,
  };
}

/** Транспорт через web-push (VAPID). Модуль тянем лениво — без ключей импорт не нужен. */
export function createWebPushTransport(): PushTransport {
  let client: typeof import("web-push") | null = null;
  const ensure = async () => {
    if (!client) {
      const mod = await import("web-push");
      const config = getVapidConfig();
      if (!config) throw new Error("VAPID keys are not configured");
      mod.setVapidDetails(config.subject, config.publicKey, config.privateKey);
      client = mod;
    }
    return client;
  };
  return {
    async send(subscription, payload) {
      const webpush = await ensure();
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
      );
    },
  };
}

/**
 * Актуальность события перед отправкой. Карта стоп-статусов:
 * - заказ/бронь с терминальным статусом — не присылаем с опозданием;
 * - «при получении» молчит после любой реакции (status !== new);
 * - онлайн-заказ событие получает уже в accepted — для него стоп-статусы терминальные.
 */
async function isEventStillRelevant(
  prisma: Pick<PrismaClient, "order" | "reservation">,
  event: { kind: string; reference: string; createdAt: Date },
  now: Date,
): Promise<boolean> {
  if (event.createdAt.getTime() < now.getTime() - PUSH_EVENT_TTL_MS) return false;
  if (event.kind === "order") {
    const order = await prisma.order.findUnique({
      where: { id: event.reference },
      select: { status: true, paymentMethod: true },
    });
    if (!order) return false;
    if (order.status === "delivered" || order.status === "issued" || order.status === "cancelled") return false;
    if (order.paymentMethod !== "online" && order.status !== "new") return false;
    return true;
  }
  const booking = await prisma.reservation.findUnique({ where: { id: event.reference }, select: { status: true } });
  return booking?.status === "new";
}

export type PushProcessResult = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  expired: number;
  revoked: number;
  pending: number;
  oldestPendingMs: number;
};

/**
 * Забирает due-доставки (pending с наступившим nextAttemptAt и зависшие sending),
 * шлёт транспортом, обновляет состояния. Повторно вызывать безопасно: захват
 * строки оптимистичный (pending|sending → sending), две параллельные job
 * одну доставку не отправят дважды.
 */
export async function processPushDeliveries(
  prisma: PrismaClient,
  deps: { transport: PushTransport; limit?: number; eventId?: string; now?: Date },
): Promise<PushProcessResult> {
  const now = deps.now ?? new Date();
  const limit = deps.limit ?? 50;
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
  const due = await prisma.adminPushDelivery.findMany({
    where: {
      OR: [
        { status: "pending", nextAttemptAt: { lte: now } },
        { status: "sending", updatedAt: { lte: staleBefore } },
      ],
      ...(deps.eventId ? { eventId: deps.eventId } : {}),
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    include: { subscription: { include: { user: { select: { active: true } } } }, event: true },
  });

  const result: PushProcessResult = { claimed: 0, sent: 0, retried: 0, failed: 0, expired: 0, revoked: 0, pending: 0, oldestPendingMs: 0 };

  for (const row of due) {
    // Захват строго по исходному состоянию строки: пока одна job держит sending,
    // вторая (свежая) эту строку не перезахватит.
    const claim = await prisma.adminPushDelivery.updateMany({
      where:
        row.status === "sending"
          ? { eventId: row.eventId, subscriptionId: row.subscriptionId, status: "sending", updatedAt: { lte: staleBefore } }
          : { eventId: row.eventId, subscriptionId: row.subscriptionId, status: "pending" },
      data: { status: "sending" },
    });
    if (claim.count === 0) continue; // строку уже взял другой процесс
    result.claimed += 1;

    const sub = row.subscription;
    const id = { eventId: row.eventId, subscriptionId: row.subscriptionId };

    if (!sub || sub.revokedAt || !sub.user.active) {
      await prisma.adminPushDelivery.update({ where: { eventId_subscriptionId: id }, data: { status: "expired", lastErrorCode: null } });
      result.expired += 1;
      continue;
    }

    if (!(await isEventStillRelevant(prisma, row.event, now))) {
      await prisma.adminPushDelivery.update({ where: { eventId_subscriptionId: id }, data: { status: "expired", lastErrorCode: null } });
      result.expired += 1;
      continue;
    }

    try {
      await deps.transport.send(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        { eventId: row.eventId, kind: row.event.kind as PushPayload["kind"], reference: row.event.reference, label: row.event.label },
      );
      await prisma.adminPushDelivery.update({
        where: { eventId_subscriptionId: id },
        data: { status: "sent", sentAt: now, lastErrorCode: null },
      });
      result.sent += 1;
    } catch (error) {
      const code = pushErrorCode(error);
      if (code === "gone") {
        await prisma.adminPushSubscription.updateMany({ where: { id: sub.id, revokedAt: null }, data: { revokedAt: now } });
        await prisma.adminPushDelivery.update({ where: { eventId_subscriptionId: id }, data: { status: "expired", lastErrorCode: code } });
        result.expired += 1;
        result.revoked += 1;
        continue;
      }
      const attempts = row.attempts + 1;
      if (attempts >= MAX_PUSH_ATTEMPTS) {
        await prisma.adminPushDelivery.update({
          where: { eventId_subscriptionId: id },
          data: { status: "failed", attempts, lastErrorCode: code },
        });
        result.failed += 1;
      } else {
        await prisma.adminPushDelivery.update({
          where: { eventId_subscriptionId: id },
          data: {
            status: "pending",
            attempts,
            nextAttemptAt: new Date(now.getTime() + pushBackoffMs(attempts)),
            lastErrorCode: code,
          },
        });
        result.retried += 1;
      }
    }
  }

  // Завершённые доставки не должны копиться
  await prisma.adminPushDelivery.deleteMany({
    where: { status: { in: ["sent", "failed", "expired"] }, updatedAt: { lt: new Date(now.getTime() - PUSH_DELIVERY_TTL_MS) } },
  });

  // Метрики очереди: глубина и возраст старейшей ожидающей записи
  const [pendingCount, oldest] = await Promise.all([
    prisma.adminPushDelivery.count({ where: { status: "pending" } }),
    prisma.adminPushDelivery.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  result.pending = pendingCount;
  result.oldestPendingMs = oldest ? Math.max(0, now.getTime() - oldest.createdAt.getTime()) : 0;

  return result;
}

/**
 * Быстрая попытка доставки СРАЗУ после коммита транзакции события (не дожидаясь
 * cron): заказ/бронь уже отвечены гостю, push едет в фоне через after().
 * Ошибки глушим — outbox и минутный job push-delivery дожмут доставку.
 */
export function schedulePushAttempt(kind: "order" | "booking", reference: string): void {
  if (!isPushConfigured()) return;
  after(async () => {
    try {
      const prisma = getPrisma();
      const event = await prisma.adminEvent.findUnique({
        where: { kind_reference: { kind, reference } },
        select: { id: true },
      });
      if (!event) return;
      await processPushDeliveries(prisma, { transport: createWebPushTransport(), eventId: event.id, limit: 50 });
    } catch {
      // доставка не должна ронять ответ гостю
    }
  });
}
