"use server";

import { getSessionOwner } from "@/lib/owner-auth";
import { getPrisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";

/** Пополнение баланса сайта: счёт + платёж у провайдера платформы */
export async function topupAction(
  slug: string,
  amountRub: number,
): Promise<{ confirmationUrl?: string; error?: string }> {
  const owner = await getSessionOwner();
  if (!owner || owner.siteId !== slug) return { error: "Forbidden" };
  if (!Number.isFinite(amountRub) || amountRub < 100) return { error: "Минимум 100 ₽" };

  const prisma = getPrisma();
  const invoice = await prisma.invoice.create({
    data: { siteId: slug, amount: Math.round(amountRub * 100), status: "issued", comment: "Пополнение баланса" },
  });

  const providerName = process.env.PLATFORM_PAYMENT_PROVIDER ?? "mock";
  const provider = getPaymentProvider(providerName);
  if (!provider) return { error: "Платёжный провайдер не настроен" };

  const baseUrl = process.env.PLATFORM_BASE_URL ?? "http://localhost:3100";
  const payment = await provider.createPayment({
    orderId: `invoice-${invoice.id}`,
    orderNumber: invoice.id,
    amount: amountRub,
    description: `Подписка: сайт ${slug}, счёт №${invoice.id}`,
    returnUrl: `${baseUrl}/cabinet`,
  });

  await prisma.payment.create({
    data: {
      siteId: slug,
      invoiceId: invoice.id,
      providerPaymentId: payment.paymentId,
      amount: Math.round(amountRub * 100),
      status: "pending",
    },
  });

  return { confirmationUrl: payment.confirmationUrl };
}
