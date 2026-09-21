import { getPrisma } from "@/lib/db";
import { applyPaidTopup } from "@/lib/billing-ledger";
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
    await applyPaidTopup(
      prisma,
      invoiceId,
      payment.providerPaymentId ?? `mock_invoice-${invoiceId}`,
    );
  }

  // Куда вернуть пользователя: next из параметров (http/https) или кабинет
  if (next && (next.startsWith("http://") || next.startsWith("https://") || next.startsWith("/"))) {
    redirect(next);
  }
  redirect("/cabinet");
}
