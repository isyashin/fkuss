import { getPrisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Тестовая страница оплаты mock-провайдера. ТОЛЬКО вне production (или явный флаг). */
export default async function MockPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; sum?: string; next?: string }>;
}) {
  // В production mock-страница отключена, если явно не разрешена для демо
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENT !== "1") {
    notFound();
  }

  const { order, next } = await searchParams;
  const invoiceId = Number(order);
  if (!Number.isFinite(invoiceId)) redirect("/cabinet");

  const prisma = getPrisma();
  const payment = await prisma.payment.findFirst({ where: { invoiceId } });
  if (payment && payment.status !== "paid") {
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: "paid" } }),
      prisma.invoice.update({ where: { id: invoiceId }, data: { status: "paid", paidAt: new Date() } }),
      prisma.balanceTransaction.create({
        data: {
          siteId: payment.siteId,
          type: "topup",
          amount: payment.amount,
          dedupeKey: `topup:${payment.id}`,
          comment: `Оплата счёта №${invoiceId} (тест)`,
        },
      }),
      prisma.site.updateMany({
        where: { slug: payment.siteId, state: { in: ["grace", "suspended"] } },
        data: { state: "active", stateChangedAt: new Date() },
      }),
    ]);
  }

  // Куда вернуть пользователя: next из параметров (http/https) или кабинет
  if (next && (next.startsWith("http://") || next.startsWith("https://") || next.startsWith("/"))) {
    redirect(next);
  }
  redirect("/cabinet");
}
