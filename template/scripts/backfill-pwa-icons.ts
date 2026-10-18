/** Existing tenants only: reads restaurant/theme from DB, repairs assets, never seeds. */
import path from "node:path";
import { z } from "zod";
import { getPrisma } from "../src/lib/db";
import { ensureIcons } from "../src/lib/pwa-icons";

async function main() {
  const contentDir = process.env.CONTENT_DIR;
  if (!contentDir || !path.isAbsolute(contentDir)) throw new Error("An absolute CONTENT_DIR is required");
  const prisma = getPrisma();
  try {
    const rows = await prisma.settings.findMany({ where: { key: { in: ["restaurant", "theme"] } } });
    const restaurant = z.object({ name: z.string().min(1), logo: z.string().default("") })
      .parse(rows.find((row) => row.key === "restaurant")?.value);
    const theme = z.object({ accent: z.string().regex(/^#[0-9a-f]{6}$/i) })
      .parse(rows.find((row) => row.key === "theme")?.value);
    const changed = await ensureIcons(contentDir, restaurant, theme.accent);
    console.log(JSON.stringify({ icons: changed ? "repaired" : "unchanged" }));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("PWA asset upgrade failed; inspect content permissions and restaurant/theme configuration"); process.exitCode = 1; });
