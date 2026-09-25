import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { applyPaymentEvent } from "@/lib/payments/apply-event";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await params;

  let provider;
  try {
    provider = getPaymentProvider(providerName);
  } catch {
    return NextResponse.json({ error: "Провайдер не настроен" }, { status: 500 });
  }
  if (!provider) {
    return NextResponse.json({ error: "Неизвестный провайдер" }, { status: 404 });
  }
  if (!provider.verifyWebhook(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const event = provider.parseWebhook(body);
  if (!event) {
    return NextResponse.json({ ok: true }); // не наше событие — подтверждаем приём
  }

  const prisma = getPrisma();
  const shouldNotify = await applyPaymentEvent(prisma, event);

  // Уведомление об оплате — теми же каналами
  if (shouldNotify) {
    try {
      const { notifyNewOrder } = await import("@/lib/notify");
      await notifyNewOrder(event.orderId);
    } catch {
      // не роняем webhook
    }
  }

  return NextResponse.json({ ok: true });
}
