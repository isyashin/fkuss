/**
 * Авторизация гостей: email + одноразовый 6-значный код.
 * Сессия — httpOnly cookie на 30 дней.
 */
import { cookies } from "next/headers";
import { randomInt } from "node:crypto";
import { getPrisma } from "./db";
import type { Customer } from "@/generated/prisma/client";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 минут
const CODE_MAX_ATTEMPTS = 3;
const SESSION_TTL_DAYS = 30;
const SESSION_COOKIE = "resto_session";

export async function requestAuthCode(email: string): Promise<{ devCode?: string }> {
  const prisma = getPrisma();
  const code = String(randomInt(100000, 1000000));

  await prisma.authCode.create({
    data: { email, code, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });

  try {
    const { sendMail } = await import("./mailer");
    await sendMail(email, "Код входа", `Ваш код входа: ${code}\n\nДействует 10 минут.`);
    return {};
  } catch {
    // BUG-021: в production действующий код НЕ логируем — только факт сбоя
    console.warn(`[auth] SMTP недоступен, код для ${email} не доставлен`);
    const exposeCode = process.env.AUTH_DEV_CODE === "1" || process.env.NODE_ENV !== "production";
    if (exposeCode) console.log(`[auth] DEV код для ${email}: ${code}`);
    return { devCode: exposeCode ? code : undefined };
  }
}

export async function verifyAuthCode(
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const prisma = getPrisma();
  const record = await prisma.authCode.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, reason: "Код истёк или не запрашивался" };
  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    return { ok: false, reason: "Слишком много попыток. Запросите новый код." };
  }
  if (record.code !== code) {
    await prisma.authCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: "Неверный код" };
  }

  await prisma.authCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const customer = await prisma.customer.upsert({
    where: { email },
    create: { email },
    update: {},
  });

  const session = await prisma.session.create({
    data: {
      customerId: customer.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000),
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    // В проде HTTPS (Caddy). Флаг INSECURE_HTTP=1 — только для тестов по http.
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_HTTP !== "1",
    maxAge: SESSION_TTL_DAYS * 24 * 3600,
    path: "/",
  });

  return { ok: true };
}

export async function getSessionCustomer(): Promise<Customer | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { customer: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.customer;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const prisma = getPrisma();
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }
  jar.delete(SESSION_COOKIE);
}
