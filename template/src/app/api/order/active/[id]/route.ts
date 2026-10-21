import { getPrisma } from "@/lib/db";
import { guestOrderAccess, guestOrderSummary, privateOrderJson } from "@/lib/order/guest-order-tracking";
import { isGuestOrderFinished } from "@/lib/order/guest-order-state";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return privateOrderJson({ error: "Заказ не найден" },404);
  const access = await guestOrderAccess(request);
  if (!access.available) return privateOrderJson({ error: "Заказ не найден" },404);
  const order = await getPrisma().order.findFirst({ where: { AND: [{ id }, access.where] }, include: { items: true, guestCheckout: true } });
  if (!order) return privateOrderJson({ error: "Заказ не найден" },404);
  return privateOrderJson({ order: { ...guestOrderSummary(order,order.guestCheckout?.requestKey), itemsTotal: order.itemsTotal, deliveryPrice: order.deliveryPrice,
    bonusSpent: order.bonusSpent, addressText: order.addressText, comment: order.comment, desiredTime: order.desiredTime,
    confirmationUrl: order.paymentStatus === "pending" && !isGuestOrderFinished(order) ? order.guestCheckout?.confirmationUrl ?? null : null,
    items: order.items.map(i=>({ id:i.id, name:i.name, menuName:i.menuName, quantity:i.quantity, total:i.total, modifiers:i.modifiers })),
  } });
}
