/**
 * PIN владельца: второй уровень доступа к админке сайта.
 * Сотрудник с валидным unlock-cookie получает права владельца на сессию.
 * PIN хранится в Settings(key=ownerPin) БД сайта в открытом виде —
 * это замок от случайных действий, а не защита от атакующего
 * (основная безопасность — роли и серверные guard'ы).
 */
import { createHmac, timingSafeEqual, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { getPrisma } from "./db";

const COOKIE = "resto_admin_unlock";
const TTL_MS = 8 * 3600 * 1000;
const PIN_SETTINGS_KEY = "ownerPin";
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

export const ownerPinSchema = /^\d{4,6}$/;

function secret(): string {
  return process.env.CRON_SECRET ?? "owner-pin-dev-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function getOwnerPin(): Promise<string> {
  const row = await getPrisma().settings.findUnique({ where: { key: PIN_SETTINGS_KEY } });
  return typeof row?.value === "string" && ownerPinSchema.test(row.value) ? row.value : "";
}

export async function setOwnerPin(pin: string): Promise<void> {
  if (!ownerPinSchema.test(pin)) throw new Error("PIN: 4–6 цифр");
  const prisma = getPrisma();
  await prisma.settings.upsert({
    where: { key: PIN_SETTINGS_KEY },
    create: { key: PIN_SETTINGS_KEY, value: pin },
    update: { value: pin },
  });
}

export function generateOwnerPin(): string {
  return String(randomInt(1000, 1000000)).padStart(4, "0").slice(0, 6);
}

// Rate limit попыток ввода (in-memory, на процесс)
const attempts = new Map<string, { count: number; resetAt: number }>();

export function pinAttemptsLeft(key: string): number {
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt < Date.now()) return MAX_ATTEMPTS;
  return Math.max(0, MAX_ATTEMPTS - bucket.count);
}

/** Проверка PIN: rate limit 5 попыток/10 мин, timing-safe сравнение. */
export async function verifyOwnerPin(pin: string, actorId: string, ip: string): Promise<{ ok: boolean; error?: string }> {
  const key = `${actorId}:${ip}`;
  const bucket = attempts.get(key);
  if (bucket && bucket.resetAt >= Date.now() && bucket.count >= MAX_ATTEMPTS) {
    return { ok: false, error: "Слишком много попыток. Подождите несколько минут." };
  }

  const current = await getOwnerPin();
  const provided = Buffer.from(pin);
  const expected = Buffer.from(current);
  const match = current !== "" && provided.length === expected.length && timingSafeEqual(provided, expected);

  if (!bucket || bucket.resetAt < Date.now()) {
    attempts.set(key, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW_MS });
  } else {
    bucket.count += 1;
  }

  return match ? { ok: true } : { ok: false, error: "Неверный PIN" };
}

export async function setPinUnlockCookie(actorId: string): Promise<void> {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${actorId}.${expiresAt}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_HTTP !== "1",
    maxAge: TTL_MS / 1000,
    path: "/",
  });
}

/** Валиден ли unlock-cookie для указанного сотрудника. */
export async function isPinUnlocked(actorId: string): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [id, expiresAtRaw, signature] = value.split(".");
  if (!id || !expiresAtRaw || !signature || id !== actorId) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) return false;
  const payload = `${id}.${expiresAtRaw}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload));
  return a.length === b.length && timingSafeEqual(a, b);
}
