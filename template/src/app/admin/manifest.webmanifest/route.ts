import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getContentDir } from "@/lib/content-dir";
import { getSiteRestaurant, getSiteTheme } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Отдельный устанавливаемый «приложение» админки: собственные id, start_url
 * и scope (/admin), отличимая тёмная иконка. Гостевой манифест и его идентичность
 * сохранены (app/manifest.ts). Данные — только текущего tenant-а.
 */
export async function GET() {
  const restaurant = await getSiteRestaurant();
  const theme = await getSiteTheme();

  let version = "1";
  try {
    const raw = await readFile(path.join(getContentDir(), "icons", "icons.json"), "utf-8");
    version = (JSON.parse(raw) as { version?: string }).version ?? "1";
  } catch {
    // иконки ещё не сгенерированы (до первого seed)
  }

  const icon = (name: string, sizes: string) => ({
    src: `/content-asset/icons/${name}?v=${version}`,
    sizes,
    type: "image/png",
  });

  const body = {
    id: "/admin",
    name: `${restaurant.name} — админка`,
    short_name: "Админка",
    description: `Заказы и брони: ${restaurant.name}`,
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    background_color: theme.dark ? "#131110" : "#faf7f2",
    theme_color: "#191512",
    icons: [icon("admin-icon-192.png", "192x192"), icon("admin-icon-512.png", "512x512")],
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
