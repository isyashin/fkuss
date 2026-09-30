import { getPrisma } from "@/lib/db";
import { applyPaymentEvent } from "@/lib/payments/apply-event";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Тестовая оплата заказа (mock-провайдер). Только вне production без флага. */
export default async function MockPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; next?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENT !== "1") {
    notFound();
  }

  const { order, next } = await searchParams;
  const orderNumber = Number(order);
  if (!Number.isFinite(orderNumber)) redirect("/");

  const prisma = getPrisma();
  const record = await prisma.order.findUnique({ where: { number: orderNumber } });
  if (record && await applyPaymentEvent(prisma, { orderId: record.id, paymentId: record.paymentId ?? `mock_${record.id}`, status: "paid" })) {
    try {
      const { notifyNewOrder } = await import("@/lib/notify");
      await notifyNewOrder(record.id);
    } catch {
      // уведомления не роняют оплату
    }
  }

  if (next && (next.startsWith("/") || next.startsWith("http"))) {
    redirect(next);
  }
  redirect("/");
}
