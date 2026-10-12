import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: фотографии — секция «Настройки → Фотографии».
export default async function AdminGalleryPage() {
  redirect("/admin/settings?section=gallery");
}
