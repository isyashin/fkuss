import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminActor } from "@/lib/admin-auth";
import { isPinUnlocked } from "@/lib/admin-pin";
import { getSiteRestaurant, contentAssetUrl } from "@/lib/site";
import { getContentDir } from "@/lib/content-dir";
import { getIconsVersion } from "@/lib/pwa-icons";
import { getPrisma } from "@/lib/db";
import { AdminShell } from "./admin-shell";
import { AdminPushManager, AdminPushPanel } from "./admin-push";

export const dynamic = "force-dynamic";

/** Оболочка админки — часть устанавливаемого админского приложения. */
export async function generateMetadata(): Promise<Metadata> {
  const version = (await getIconsVersion(getContentDir())) ?? "1";
  return {
    manifest: "/admin/manifest.webmanifest",
    icons: {
      icon: [
        { url: `/api/site-icon?size=32&v=${version}`, type: "image/png", sizes: "32x32" },
        { url: `/api/site-icon?size=48&v=${version}`, type: "image/png", sizes: "48x48" },
      ],
      apple: `/content-asset/icons/admin-apple-touch-icon.png?v=${version}`,
    },
  };
}

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAdminActor();
  if (!actor) redirect("/admin/login");
  const prisma = getPrisma();
  const [restaurant, newOrdersCount, newBookingsCount, unlocked] = await Promise.all([
    getSiteRestaurant(),
    prisma.order.count({ where: { status: "new" } }),
    prisma.reservation.count({ where: { status: "new" } }),
    actor.role === "owner" ? Promise.resolve(true) : isPinUnlocked(actor.id),
  ]);

  return (
    <>
      <style>{"body > header:first-of-type { display: none; }"}</style>
      <AdminShell restaurantName={restaurant.name} logo={restaurant.logo ? contentAssetUrl(restaurant.logo) : ""} actor={actor}
        newOrdersCount={newOrdersCount} newBookingsCount={newBookingsCount} unlocked={unlocked}>
        {children}
      </AdminShell>
      <AdminPushManager />
      <AdminPushPanel />
    </>
  );
}
