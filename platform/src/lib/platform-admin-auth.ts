import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "platform_admin";
const TTL = 7 * 24 * 3600 * 1000;

function secret(): string {
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PLATFORM_ADMIN_PASSWORD не задан");
    }
    return "platform-admin";
  }
  return password;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function loginPlatformAdmin(password: string): Promise<boolean> {
  const a = Buffer.from(password);
  const b = Buffer.from(secret());
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const payload = String(Date.now());
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_HTTP !== "1",
    maxAge: TTL / 1000,
    path: "/",
  });
  return true;
}

export async function isPlatformAdmin(): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Date.now() - Number(payload) <= TTL;
}
