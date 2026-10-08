import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { generateWindows, isOptionAvailableOn, type DeliveryOptionRule } from "@/lib/delivery/slots";
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
  const result = options.map((option) => {
    const rule = option as DeliveryOptionRule;
    // F03: витрина не должна предлагать вариант, который сервер отклонит
    // (ни одного дня недели / сегодняшняя дата в исключениях / нет окон).
    const available =
      option.mode === "asap"
        ? isOptionAvailableOn(rule, now, tz)
        : generateWindows(rule, now, tz).length > 0;
    return {
      id: option.id,
      name: option.name,
      mode: option.mode,
      price: option.price,
      freeFrom: option.freeFrom,
      available,
      windows: option.mode === "scheduled" ? generateWindows(rule, now, tz) : [],
    };
  });

  return NextResponse.json({ options: result, tz });
}
