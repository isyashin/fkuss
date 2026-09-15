/**
 * Аутентификация админки ресторатора: пароль из env ADMIN_PASSWORD,
 * сессия — подписанная кука (HMAC-SHA256 от timestamp).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "resto_admin";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 дней

function getPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      // Без заданного пароля вход в production запрещён
      throw new Error("ADMIN_PASSWORD не задан");
    }
    return "admin";
  }
  return password;
}

function sign(payload: string): string {
  return createHmac("sha256", getPassword()).update(payload).digest("hex");
}

export async function loginAdmin(password: string): Promise<boolean> {
  const expected = Buffer.from(getPassword());
  const given = Buffer.from(password);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return false;
  }
  const payload = String(Date.now());
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_HTTP !== "1",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
  return true;
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const ts = Number(payload);
  if (!Number.isFinite(ts) || Date.now() - ts > SESSION_TTL_MS) return false;
  return true;
}

export async function logoutAdmin(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}
