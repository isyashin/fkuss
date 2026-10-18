import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { ORDER_CONFIRMATION_COOKIE, ORDER_CONFIRMATION_COOKIE_PATH } from "./auth-cookie-names";

export const ORDER_CONFIRMATION_TTL_SECONDS = 7 * 24 * 3600;
export function orderConfirmationSecret(): string | undefined {
  return process.env.SITE_KEY || process.env.SESSION_SECRET || process.env.CRON_SECRET;
}
function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update("order-confirmation-v1." + payload).digest("base64url");
}
/** The proof stays in an HttpOnly cookie, never in a receipt URL or access log. */
export function createOrderConfirmationToken(id: string, secret: string | undefined, now = Date.now()): string | null {
  if (!secret || !id || id.length > 128) return null;
  const payload = Buffer.from(JSON.stringify([id, now + ORDER_CONFIRMATION_TTL_SECONDS * 1000])).toString("base64url");
  return payload + "." + signature(payload, secret);
}
export function isOrderConfirmationTokenValid(token: string | undefined, id: string, secret: string | undefined, now = Date.now()): boolean {
  if (!token || !secret || token.length > 512) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false;
  const expected = signature(parts[0], secret);
  if (!timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) return false;
  try {
    const value: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return Array.isArray(value) && value.length === 2 && value[0] === id && Number.isSafeInteger(value[1]) && value[1] > now;
  } catch { return false; }
}
export function attachOrderConfirmation<T extends NextResponse>(response: T, id: string): T {
  const proof = createOrderConfirmationToken(id, orderConfirmationSecret());
  if (proof) response.cookies.set(ORDER_CONFIRMATION_COOKIE, proof, {
    httpOnly: true, sameSite: "lax", path: ORDER_CONFIRMATION_COOKIE_PATH,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_HTTP !== "1",
    maxAge: ORDER_CONFIRMATION_TTL_SECONDS,
  });
  return response;
}
