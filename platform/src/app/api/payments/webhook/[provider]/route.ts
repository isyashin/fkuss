import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await params;

  let provider;
  try {
    provider = getPaymentProvider(providerName);
  } catch {
    return NextResponse.json({ error: "Провайдер не настроен" }, { status: 500 });
  }
  if (!provider) return NextResponse.json({ error: "Неизвестный провайдер" }, { status: 404 });
  if (!provider.verifyWebhook(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const event = provider.parseWebhook(body);
  if (!event) return NextResponse.json({ ok: true });

  // orderId = invoice-<id>
  const invoiceId = Number(event.orderId.replace("invoice-", ""));
  if (!Number.isFinite(invoiceId)) return NextResponse.json({ ok: true });

  const prisma = getPrisma();
  const payment = await prisma.payment.findFirst({ where: { invoiceId } });
  if (!payment || payment.status === "paid") return NextResponse.json({ ok: true }); // идемпотентность

  if (event.status === "paid") {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "paid", providerPaymentId: event.paymentId },
      }),
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "paid", paidAt: new Date() },
      }),
      prisma.balanceTransaction.create({
        data: {
          siteId: payment.siteId,
          type: "topup",
          amount: payment.amount,
          comment: `Оплата счёта №${invoiceId}`,
        },
      }),
      // Реактивация: если сайт был приостановлен — баланс пополнен, вернём в active
      // (billing-daily пересчитает точно, здесь — быстрый откат)
      prisma.site.updateMany({
        where: { slug: payment.siteId, state: { in: ["grace", "suspended"] } },
        data: { state: "active", stateChangedAt: new Date() },
      }),
    ]);
  } else {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
  }

  return NextResponse.json({ ok: true });
}
