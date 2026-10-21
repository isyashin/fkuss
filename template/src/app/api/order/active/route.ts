import { getPrisma } from "@/lib/db";
import { guestOrderAccess, guestOrderSummary, privateOrderJson } from "@/lib/order/guest-order-tracking";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const access = await guestOrderAccess(request);
  if (!access.available) return privateOrderJson({ orders: [], available: false });
  const known = (new URL(request.url).searchParams.get("known") ?? "").split(",").filter(s => /^[a-zA-Z0-9_-]{1,128}$/.test(s)).slice(0,100);
  const orders = await getPrisma().order.findMany({
    where: { AND: [access.where, { OR: [
      { status: { notIn: ["delivered", "issued", "cancelled"] } },
      { updatedAt: { gte: new Date(Date.now()-7*86400_000) } }, { id: { in: known } },
    ] }] },
    include: { guestCheckout: { select: { requestKey: true } } }, orderBy: { createdAt: "desc" }, take: 100,
  });
  return privateOrderJson({ available: true, orders: orders.map(o => guestOrderSummary(o, o.guestCheckout?.requestKey)) });
}
