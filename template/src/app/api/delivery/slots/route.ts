import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { orderAvailability } from "@/lib/order/availability";
import { getSiteRestaurant, getSiteSettings } from "@/lib/site";

/** Варианты доставки и доступные окна: GET /api/delivery/slots */
export async function GET() {
  const [settings, restaurant, options] = await Promise.all([
    getSiteSettings(), getSiteRestaurant(),
    // Disabled options still count as configured in the order API: they must
    // not accidentally turn on the legacy preorder path for delivery.
    getPrisma().deliveryOption.findMany({ orderBy: { position: "asc" } }),
  ]);
  return NextResponse.json(orderAvailability(settings, restaurant, options), {
    headers: { "Cache-Control": "no-store" },
  });
}
