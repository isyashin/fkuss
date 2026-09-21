import { contentAssetUrl, getSiteRestaurant, getSiteSettings, getSiteTheme } from "@/lib/site";
import { getPrisma } from "@/lib/db";
import {
  createDefaultPrintMaterial,
  normalizePrintMaterialsSettings,
  type PrintBrand,
  type PrintMaterialsSettings,
} from "@/lib/print-materials";
import { PrintMaterialsAdmin } from "./print-materials-admin";

export const dynamic = "force-dynamic";

export default async function AdminPrintMaterialsPage() {
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
  const initialSettings = normalizePrintMaterialsSettings(stored?.value, defaults);
  const brand: PrintBrand = {
    name: restaurant.name,
    phone: restaurant.phone,
    address: restaurant.address,
    logoUrl: restaurant.logo ? contentAssetUrl(restaurant.logo) : "",
  };

  return (
    <div>
      <h1 className="text-2xl mb-2">Печатные материалы</h1>
      <p className="text-muted mb-6 max-w-3xl">
        Подготовьте визитку для пакета с заказом или магнит на холодильник. QR-код ведёт на сайт
        ресторана и содержит метки для аналитики.
      </p>
      <PrintMaterialsAdmin initialSettings={initialSettings} brand={brand} restaurantSlug={restaurant.slug} />
    </div>
  );
}
