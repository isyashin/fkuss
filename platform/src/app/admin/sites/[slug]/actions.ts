"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/platform-admin-auth";

async function guard() {
  if (!(await isPlatformAdmin())) throw new Error("Forbidden");
}

/** Ручная корректировка баланса (₽ → копейки), комментарий обязателен */
export async function adjustBalance(slug: string, amountRub: number, comment: string): Promise<void> {
  await guard();
  if (!comment.trim()) throw new Error("Нужен комментарий");
  const prisma = getPrisma();
  await prisma.balanceTransaction.create({
    data: {
      siteId: slug,
      type: amountRub >= 0 ? "topup" : "adjustment",
      amount: Math.round(amountRub * 100),
      comment: `Ручная операция: ${comment}`,
    },
  });
  // Переоценка состояния произойдёт при следующем billing-daily
  revalidatePath(`/admin/sites/${slug}`);
  revalidatePath("/admin");
}

export async function setTariff(slug: string, tariffId: string | null): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.site.update({ where: { slug }, data: { tariffId } });
  revalidatePath(`/admin/sites/${slug}`);
}

export async function setSiteState(slug: string, state: "active" | "suspended", comment: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.site.update({
    where: { slug },
    data: { state, stateChangedAt: new Date() },
  });
  await prisma.balanceTransaction.create({
    data: { siteId: slug, type: "adjustment", amount: 0, comment: `Состояние → ${state}: ${comment}` },
  });
  revalidatePath(`/admin/sites/${slug}`);
  revalidatePath("/admin");
}
