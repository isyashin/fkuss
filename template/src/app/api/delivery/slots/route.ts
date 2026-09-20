import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { generateWindows, type DeliveryOptionRule } from "@/lib/delivery/slots";
import { getSiteSettings } from "@/lib/site";

const DEFAULT_TZ = "Europe/Moscow";

/** Варианты доставки и доступные окна: GET /api/delivery/slots */
export async function GET() {
  const prisma = getPrisma();
  const settings = await getSiteSettings();
  const tz = (settings as { timezone?: string }).timezone ?? DEFAULT_TZ;

  const options = await prisma.deliveryOption.findMany({
    where: { enabled: true },
    orderBy: { position: "asc" },
  });

  const now = new Date();
  const result = options.map((option) => ({
    id: option.id,
    name: option.name,
    mode: option.mode,
    price: option.price,
    freeFrom: option.freeFrom,
    windows:
      option.mode === "scheduled"
        ? generateWindows(option as DeliveryOptionRule, now, tz)
        : [],
  }));

  return NextResponse.json({ options: result, tz });
}
