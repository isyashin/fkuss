import { getPrisma } from "@/lib/db";
import { GalleryAdmin } from "./gallery-admin";

export const dynamic = "force-dynamic";

export default async function AdminGalleryPage() {
  const prisma = getPrisma();
  const images = await prisma.galleryImage.findMany({ orderBy: { position: "asc" } });

  return (
    <div>
      <h1 className="text-2xl mb-4">Галерея</h1>
      <GalleryAdmin images={images} />
    </div>
  );
}
