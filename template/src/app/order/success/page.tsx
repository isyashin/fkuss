import Link from "next/link";
import { getPrisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function OrderSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  const { n } = await searchParams;
  const number = Number(n);
  const prisma = getPrisma();
  const order = Number.isFinite(number)
    ? await prisma.order.findUnique({ where: { number }, include: { items: true } })
    : null;

  const paid = order?.paymentStatus === "paid";
  const cash = !!order && order.paymentMethod !== "online";

  // Дублирование заказа в WhatsApp — как раньше в шторке корзины.
  let whatsappHref = "";
  if (order && cash) {
    try {
      const settings = await getSiteSettings();
      const whatsapp = settings.channels.whatsapp;
      if (whatsapp.enabled && whatsapp.phone) {
        const text = [
          `Заказ №${order.number}`,
          ...order.items.map((item) => `${item.name} × ${item.quantity}`),
          `Итого: ${order.total.toLocaleString("ru-RU")} ₽`,
          `Гость: ${order.customerName}, ${order.customerPhone}`,
          order.type === "delivery" ? `Адрес: ${order.addressText}` : "Самовывоз",
        ].join("\n");
        whatsappHref = `https://wa.me/${whatsapp.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
      }
    } catch {
      // настройки недоступны — ссылку не показываем
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <p className="text-5xl mb-4">{paid || cash ? "✓" : "…"}</p>
        {order ? (
          paid ? (
            <>
              <h1 className="text-2xl">Заказ №{order.number} оплачен</h1>
              <p className="text-muted mt-2">Спасибо! Мы начали готовить.</p>
            </>
          ) : cash ? (
            <>
              <h1 className="text-2xl">Заказ №{order.number} принят</h1>
              <p className="text-muted mt-2">Мы свяжемся с вами выбранным способом для подтверждения.</p>
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener"
                  className="mt-5 inline-flex items-center justify-center min-h-12 px-6 rounded-full bg-[#25D366] text-white font-medium"
                >
                  Дублировать заказ в WhatsApp
                </a>
              )}
            </>
          ) : (
            <>
              <h1 className="text-2xl">Заказ №{order.number}</h1>
              <p className="text-muted mt-2">
                Проверяем статус оплаты. Если деньги списались — заказ подтвердится автоматически.
              </p>
            </>
          )
        ) : (
          <h1 className="text-2xl">Заказ не найден</h1>
        )}
        <Link
          href="/"
          className="mt-6 inline-flex min-h-12 px-8 items-center justify-center rounded-full bg-accent text-white font-medium"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
