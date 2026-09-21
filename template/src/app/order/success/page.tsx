import Link from "next/link";
import { getPrisma } from "@/lib/db";

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
    ? await prisma.order.findUnique({ where: { number } })
    : null;

  const paid = order?.paymentStatus === "paid";

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <p className="text-5xl mb-4">{paid ? "✓" : "…"}</p>
        {order ? (
          <>
            <h1 className="text-2xl">
              {paid ? `Заказ №${order.number} оплачен` : `Заказ №${order.number}`}
            </h1>
            <p className="text-muted mt-2">
              {paid
                ? "Спасибо! Мы начали готовить."
                : "Проверяем статус оплаты. Если деньги списались — заказ подтвердится автоматически."}
            </p>
          </>
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
