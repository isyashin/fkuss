import { getSiteSettings, getSiteTheme } from "@/lib/site";
import { SettingsAdmin } from "./settings-admin";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [settings, theme] = await Promise.all([getSiteSettings(), getSiteTheme()]);

  return (
    <div>
      <h1 className="text-2xl mb-4">Настройки</h1>
      <SettingsAdmin settings={settings} theme={theme} />
    </div>
  );
}
