import { getSiteSettings, getSiteTheme } from "@/lib/site";
import { requireAdminPermission } from "@/lib/admin-auth";
import { SettingsAdmin } from "./settings-admin";
import { readAdminSound, publicAdminSound } from "@/lib/admin-sound";
import { getPrisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdminPermission("manage");
  const [settings, theme, sound] = await Promise.all([getSiteSettings(), getSiteTheme(), readAdminSound(getPrisma())]);

  return <SettingsAdmin settings={settings} theme={theme} sound={publicAdminSound(sound)} />;
}
