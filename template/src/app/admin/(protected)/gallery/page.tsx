import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { GalleryAdmin } from "./gallery-admin";
import { AdminSettingsSubpage } from "../admin-settings-subpage";

export const dynamic = "force-dynamic";

export default async function AdminGalleryPage() {
  await requireAdminPermission("manage");
  const prisma = getPrisma();
  const images = await prisma.galleryImage.findMany({ orderBy: { position: "asc" } });

  return (
    <AdminSettingsSubpage title="Галерея" description="Фотографии для гостевого сайта.">
      <GalleryAdmin images={images} />
    </AdminSettingsSubpage>
  );
}
