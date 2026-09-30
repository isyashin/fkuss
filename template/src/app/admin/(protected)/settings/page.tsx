import { redirect } from "next/navigation";
import { getAdminActor } from "@/lib/admin-auth";
import { isPinUnlocked } from "@/lib/admin-pin";
import { getSiteSettings, getSiteTheme } from "@/lib/site";
import { SettingsAdmin } from "./settings-admin";
import { readAdminSound, publicAdminSound } from "@/lib/admin-sound";
import { getPrisma } from "@/lib/db";
import { OtherSettingsSections, RestaurantSettingsSection } from "./settings-extra-sections";
import { PinGate } from "./pin-gate";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const actor = await getAdminActor();
  if (!actor) redirect("/admin/login");

  // Сотрудник без PIN-unlock видит экран ввода PIN вместо настроек.
  const unlocked = actor.role === "owner" || (await isPinUnlocked(actor.id));
  if (!unlocked) return <PinGate />;

  const [settings, theme, sound] = await Promise.all([getSiteSettings(), getSiteTheme(), readAdminSound(getPrisma())]);

  return <SettingsAdmin settings={settings} theme={theme} sound={publicAdminSound(sound)} actor={{ name: actor.name, role: actor.role }}
    restaurantSection={<RestaurantSettingsSection/>} otherSections={<OtherSettingsSections/>}
    ymapsKey={process.env.YANDEX_MAPS_API_KEY ?? ""}/>;
}
