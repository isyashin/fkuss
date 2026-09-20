import type { MetadataRoute } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSiteRestaurant, getSiteTheme } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const restaurant = await getSiteRestaurant();
  const theme = await getSiteTheme();

  let version = "1";
  try {
    const raw = await readFile(path.join(process.cwd(), "content", "icons", "icons.json"), "utf-8");
    version = (JSON.parse(raw) as { version?: string }).version ?? "1";
  } catch {
    // иконки ещё не сгенерированы (до первого seed)
  }

  const icon = (name: string, sizes: string) => ({
    src: `/content-asset/icons/${name}?v=${version}`,
    sizes,
    type: "image/png",
  });

  return {
    name: restaurant.name,
    short_name: restaurant.name,
    description: restaurant.seo.description,
    start_url: "/",
    display: "standalone",
    background_color: theme.dark ? "#131110" : "#faf7f2",
    theme_color: theme.accent,
    icons: [icon("icon-192.png", "192x192"), icon("icon-512.png", "512x512")],
  };
}
