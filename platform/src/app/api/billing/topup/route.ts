import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";

const schema = z.object({
  amountRub: z.number().min(100).max(1000000),
  returnUrl: z.string().max(500).optional(),
});

/** Пополнение баланса сайта по site key (из админки ресторана). */
export async function POST(request: Request) {
  const siteKey = request.headers.get("x-site-key");
  if (!siteKey) return NextResponse.json({ error: "Нет ключа" }, { status: 401 });

  const prisma = getPrisma();
  const site = await prisma.site.findUnique({ where: { siteKey } });
  if (!site) return NextResponse.json({ error: "Неизвестный сайт" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Сумма от 100 ₽" }, { status: 400 });
  }

  const amountRub = parsed.data.amountRub;
  const invoice = await prisma.invoice.create({
    data: {
      siteId: site.slug,
      amount: Math.round(amountRub * 100),
      status: "issued",
      comment: "Пополнение из админки сайта",
    },
  });

  const providerName = process.env.PLATFORM_PAYMENT_PROVIDER ?? "mock";
  const provider = getPaymentProvider(providerName);
  if (!provider) return NextResponse.json({ error: "Провайдер не настроен" }, { status: 500 });

  const baseUrl = process.env.PLATFORM_BASE_URL ?? "http://localhost:3100";
  const returnUrl = parsed.data.returnUrl ?? `${baseUrl}/cabinet`;
  const payment = await provider.createPayment({
    orderId: `invoice-${invoice.id}`,
    orderNumber: invoice.id,
    amount: amountRub,
    description: `Подписка: сайт ${site.slug}, счёт №${invoice.id}`,
    returnUrl,
  });

  await prisma.payment.create({
    data: {
      siteId: site.slug,
      invoiceId: invoice.id,
      providerPaymentId: payment.paymentId,
      amount: Math.round(amountRub * 100),
      status: "pending",
    },
  });

  // Относительный confirmationUrl (mock) — превращаем в абсолютный платформы,
  // чтобы браузер с домена сайта попал на платформу
  const confirmationUrl = payment.confirmationUrl.startsWith("/")
    ? `${baseUrl}${payment.confirmationUrl}`
    : payment.confirmationUrl;

  return NextResponse.json({ invoiceId: invoice.id, confirmationUrl });
}
