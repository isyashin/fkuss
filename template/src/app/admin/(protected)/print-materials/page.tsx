import { contentAssetUrl, getSiteRestaurant, getSiteSettings, getSiteTheme } from "@/lib/site";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/db";
import {
  createDefaultPrintMaterial,
  normalizePrintMaterialsSettings,
  withCanonicalQrUrl,
  type PrintBrand,
  type PrintMaterialsSettings,
} from "@/lib/print-materials";
import { PrintMaterialsAdmin } from "./print-materials-admin";
import { AdminSettingsSubpage } from "../admin-settings-subpage";

export const dynamic = "force-dynamic";

export default async function AdminPrintMaterialsPage() {
  await requireAdminPermission("manage");
  const prisma = getPrisma();
  const [restaurant, siteSettings, theme, stored] = await Promise.all([
    getSiteRestaurant(),
    getSiteSettings(),
    getSiteTheme(),
    prisma.settings.findUnique({ where: { key: "printMaterials" } }),
  ]);

  const defaults: PrintMaterialsSettings = {
    card: createDefaultPrintMaterial("card", {
      canonical: siteSettings.domains.canonical,
      accent: theme.accent,
    }),
    magnet: createDefaultPrintMaterial("magnet", {
      canonical: siteSettings.domains.canonical,
      accent: theme.accent,
    }),
  };
  const normalized = normalizePrintMaterialsSettings(stored?.value, defaults);
  const initialSettings: PrintMaterialsSettings = {
    card: withCanonicalQrUrl(normalized.card, siteSettings.domains.canonical),
    magnet: withCanonicalQrUrl(normalized.magnet, siteSettings.domains.canonical),
  };
  const brand: PrintBrand = {
    name: restaurant.name,
    phone: restaurant.phone,
    address: restaurant.address,
    logoUrl: restaurant.logo ? contentAssetUrl(restaurant.logo) : "",
  };

  return (
    <AdminSettingsSubpage title="Печатные материалы" description="Визитки и магниты с QR-кодом гостевого сайта.">
      <PrintMaterialsAdmin initialSettings={initialSettings} brand={brand} restaurantSlug={restaurant.slug} />
    </AdminSettingsSubpage>
  );
}
