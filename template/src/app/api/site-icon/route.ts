import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getContentDir } from "@/lib/content-dir";
import { getSiteRestaurant, getSiteTheme } from "@/lib/site";

export const dynamic = "force-dynamic";

const SIZES = [16, 32, 48];

/**
 * Фавикон сайта: логотип ресторана; без лого — плашка с первой буквой
 * названия в фирменном цвете (та же логика, что у PWA-иконок).
 * Кэш 1 день — после смены логотипа ?v= в layout меняет URL.
 */
export async function GET(request: Request) {
  const sizeParam = Number(new URL(request.url).searchParams.get("size") ?? "32");
  const size = SIZES.includes(sizeParam) ? sizeParam : 32;

  const [restaurant, theme] = await Promise.all([getSiteRestaurant(), getSiteTheme()]);
  const contentDir = getContentDir();

  let source: Buffer | null = null;
  if (restaurant.logo) {
    try {
      source = await readFile(path.join(contentDir, restaurant.logo));
    } catch {
      source = null;
    }
  }
  if (!source) {
    const letter = (restaurant.name.trim()[0] ?? "R").toUpperCase();
    source = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
      <rect width="64" height="64" rx="12" fill="${theme.accent}"/>
      <text x="50%" y="54%" font-family="Arial, sans-serif" font-size="34" font-weight="bold"
        fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${letter}</text>
    </svg>`);
  }

  const png = await sharp(source)
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
