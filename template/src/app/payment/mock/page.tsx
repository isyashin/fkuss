import { getPrisma } from "@/lib/db";
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
  if (record && record.paymentStatus !== "paid") {
    await prisma.order.update({
      where: { id: record.id },
      data: {
        paymentStatus: "paid",
        status: record.status === "new" ? "accepted" : record.status,
      },
    });
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
