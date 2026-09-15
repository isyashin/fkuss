"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function savePromo(input: {
  id?: string;
  title: string;
  text: string;
  image?: string;
}): Promise<void> {
  await guard();
  const prisma = getPrisma();
  if (input.id) {
    await prisma.promo.update({
      where: { id: input.id },
      data: { title: input.title, text: input.text, image: input.image ?? "" },
    });
  } else {
    await prisma.promo.create({
      data: {
        id: `promo-${Date.now().toString(36)}`,
        title: input.title,
        text: input.text,
        image: input.image ?? "",
      },
    });
  }
  revalidatePath("/admin/promos");
  revalidatePath("/");
}

export async function deletePromo(id: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.promo.delete({ where: { id } });
  revalidatePath("/admin/promos");
  revalidatePath("/");
}

export async function savePage(slug: string, title: string, body: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.page.upsert({
    where: { slug },
    create: { slug, title, body },
    update: { title, body },
  });
  revalidatePath("/admin/pages");
  revalidatePath(`/p/${slug}`);
}

export async function addGalleryImage(image: string, alt: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.galleryImage.create({ data: { image, alt } });
  revalidatePath("/admin/gallery");
  revalidatePath("/");
}

export async function deleteGalleryImage(id: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.galleryImage.delete({ where: { id } });
  revalidatePath("/admin/gallery");
  revalidatePath("/");
}
