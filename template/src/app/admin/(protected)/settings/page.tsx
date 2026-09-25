import { getSiteSettings, getSiteTheme } from "@/lib/site";
import { requireAdminPermission } from "@/lib/admin-auth";
import { SettingsAdmin } from "./settings-admin";
import { readAdminSound, publicAdminSound } from "@/lib/admin-sound";
import { getPrisma } from "@/lib/db";
import { OtherSettingsSections, RestaurantSettingsSection } from "./settings-extra-sections";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const actor = await requireAdminPermission("manage");
  const [settings, theme, sound] = await Promise.all([getSiteSettings(), getSiteTheme(), readAdminSound(getPrisma())]);

  return <SettingsAdmin settings={settings} theme={theme} sound={publicAdminSound(sound)} actor={{ name: actor.name, role: actor.role }}
    restaurantSection={<RestaurantSettingsSection/>} otherSections={<OtherSettingsSections/>}/>;
}
