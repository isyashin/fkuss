import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { Order, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { getSessionCustomer } from "@/lib/auth";
import { GUEST_ORDER_COOKIE } from "@/lib/auth-cookie-names";
import { attachOrderConfirmation } from "@/lib/order-confirmation";
import type { GuestOrderSummary } from "./guest-order-state";

export const GUEST_ORDER_TTL = 60 * 24 * 3600;
export function privateOrderJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "x-fkuss-cache": "private" } });
}
export function sameOrderOrigin(request: Request): boolean {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const url = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
    const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0,-1);
    return origin.host === host && origin.protocol === `${protocol}:` && ["http:","https:"].includes(origin.protocol);
  } catch { return false; }
}
export function trackingToken(request: Request): string | null {
  const value = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(GUEST_ORDER_COOKIE+"="))?.slice(GUEST_ORDER_COOKIE.length+1);
  return value && /^[A-Za-z0-9_-]{64}$/.test(value) ? value : null;
}
export function trackingHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export async function trackingSession(request: Request) {
  const token = trackingToken(request);
  if (!token) return null;
  const session = await getPrisma().guestOrderSession.findUnique({ where: { id: trackingHash(token) } });
  return session && session.expiresAt > new Date() ? session : null;
}
export async function ensureTrackingSession(request: Request) {
  const prisma = getPrisma();
  const existing = await trackingSession(request);
  const response = privateOrderJson({ ok: true });
  const expiresAt = new Date(Date.now()+GUEST_ORDER_TTL*1000);
  if (existing) {
    if (existing.expiresAt.getTime()-Date.now() > GUEST_ORDER_TTL*500) return response;
    await prisma.guestOrderSession.update({ where: { id: existing.id }, data: { expiresAt } });
  }
  const token = existing ? trackingToken(request)! : randomBytes(48).toString("base64url");
  if (!existing) await prisma.guestOrderSession.create({ data: { id: trackingHash(token), expiresAt } });
  response.cookies.set(GUEST_ORDER_COOKIE, token, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_HTTP !== "1", maxAge: GUEST_ORDER_TTL });
  return response;
}
export function guestOrderSummary(order: Order, requestKey: string | null = null): GuestOrderSummary {
  return { id: order.id, number: order.number, type: order.type, status: order.status, paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod, total: order.total, createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString(), requestKey };
}
export async function guestOrderAccess(request: Request): Promise<{ where: Prisma.OrderWhereInput; available: boolean }> {
  const [session, customer] = await Promise.all([trackingSession(request), getSessionCustomer()]);
  const owners: Prisma.OrderWhereInput[] = [];
  if (session) owners.push({ guestCheckout: { sessionId: session.id } });
  if (customer) owners.push({ customerId: customer.id });
  return { available: owners.length > 0, where: { OR: owners } };
}
export async function replayCheckout(sessionId: string, requestKey: string, requestHash: string) {
  const checkout = await getPrisma().guestCheckout.findUnique({ where: { sessionId_requestKey: { sessionId, requestKey } }, include: { order: true } });
  if (!checkout) return null;
  if (checkout.requestHash !== requestHash) return privateOrderJson({ error: "Заказ уже отправлен с другими данными. Откройте его статус." }, 409);
  const order = checkout.order;
  return attachOrderConfirmation(privateOrderJson({ ok: true, createdOrder: true, order: guestOrderSummary(order, requestKey),
    orderNumber: order.number, total: order.total, itemsTotal: order.itemsTotal, deliveryPrice: order.deliveryPrice, bonusSpent: order.bonusSpent,
    confirmationUrl: order.paymentStatus === "pending" ? checkout.confirmationUrl : null,
    preparingPayment: order.paymentMethod === "online" && order.paymentStatus === "pending" && !checkout.confirmationUrl }), order.id);
}
