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
  const order = await prisma.order.findUnique({ where: { id: event.orderId } });
  if (!order) {
    return NextResponse.json({ ok: true }); // заказ не найден — не ретраим
  }

  // Идемпотентность: финальный статус не перезаписываем
  if (order.paymentStatus === "paid" || order.paymentStatus === "failed") {
    return NextResponse.json({ ok: true });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: event.status,
      paymentId: event.paymentId,
      // Оплаченный онлайн заказ сразу считаем принятым
      status: event.status === "paid" && order.status === "new" ? "accepted" : order.status,
    },
  });

  // Уведомление об оплате — теми же каналами
  if (event.status === "paid") {
    try {
      const { notifyNewOrder } = await import("@/lib/notify");
      await notifyNewOrder(order.id);
    } catch {
      // не роняем webhook
    }
  }

  return NextResponse.json({ ok: true });
}
