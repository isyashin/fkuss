import type { MetadataRoute } from "next";
import { getRestaurant, getTheme } from "@/lib/content";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const restaurant = await getRestaurant();
  const theme = await getTheme();

  return {
    name: restaurant.name,
    short_name: restaurant.name,
    description: restaurant.seo.description,
    start_url: "/",
    display: "standalone",
    background_color: theme.dark ? "#131110" : "#faf7f2",
    theme_color: theme.accent,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
