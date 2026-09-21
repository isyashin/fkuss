import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { applyPaidTopup } from "@/lib/billing-ledger";

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
  if (event.status === "paid") {
    await applyPaidTopup(prisma, invoiceId, event.paymentId);
  } else {
    await prisma.payment.updateMany({
      where: { invoiceId, status: "pending" },
      data: { status: "failed" },
    });
  }

  return NextResponse.json({ ok: true });
}
