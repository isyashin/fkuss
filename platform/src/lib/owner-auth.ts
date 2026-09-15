/** Владелец сайта: вход по email-коду (коды в БД — надёжно между процессами). */
import { cookies } from "next/headers";
import { randomInt } from "node:crypto";
import { getPrisma } from "./db";
import type { OwnerAccount } from "@/generated/prisma/client";

const CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_COOKIE = "platform_owner";
const SESSION_TTL = 30 * 24 * 3600;

export async function requestOwnerCode(email: string): Promise<{ devCode?: string }> {
  const prisma = getPrisma();
  const owner = await prisma.ownerAccount.findUnique({ where: { email } });
  if (!owner) return {}; // не палим существование аккаунта

  const code = String(randomInt(100000, 1000000));
  await prisma.ownerAuthCode.create({
    data: { email, code, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });

  try {
    const nodemailer = (await import("nodemailer")).default;
    if (!process.env.SMTP_URL) throw new Error("no smtp");
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({
      from: process.env.SMTP_FROM ?? "noreply@platform",
      to: email,
      subject: "Код входа в кабинет платформы",
      text: `Ваш код: ${code}\nДействует 10 минут.`,
    });
    return {};
  } catch {
    console.log(`[platform-auth] Код для ${email}: ${code}`);
    const expose = process.env.AUTH_DEV_CODE === "1" || process.env.NODE_ENV !== "production";
    return { devCode: expose ? code : undefined };
  }
}

export async function verifyOwnerCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; reason?: string }> {
  const prisma = getPrisma();
  const record = await prisma.ownerAuthCode.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, reason: "Код истёк или не запрашивался" };
  if (record.attempts >= 3) return { ok: false, reason: "Слишком много попыток" };
  if (record.code !== code) {
    await prisma.ownerAuthCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "Неверный код" };
  }

  await prisma.ownerAuthCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const owner = await prisma.ownerAccount.findUnique({ where: { email } });
  if (!owner) return { ok: false, reason: "Аккаунт не найден" };

  const jar = await cookies();
  jar.set(SESSION_COOKIE, owner.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_HTTP !== "1",
    maxAge: SESSION_TTL,
    path: "/",
  });
  return { ok: true };
}

export async function getSessionOwner(): Promise<OwnerAccount | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return getPrisma().ownerAccount.findUnique({ where: { id } });
}
