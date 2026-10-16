"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/platform-admin-auth";

async function guard() {
  if (!(await isPlatformAdmin())) throw new Error("Forbidden");
}

/** Ручная корректировка баланса (₽ → копейки), комментарий обязателен */
export async function adjustBalance(slug: string, amountRub: number, comment: string): Promise<
  { ok: true } | { ok: false; fieldErrors?: { amount?: string; comment?: string }; error?: string }
> {
  await guard();
  const kopecks = amountRub * 100;
  const rounded = Math.round(kopecks);
  if (typeof amountRub !== "number" || !Number.isFinite(kopecks) ||
      Math.abs(kopecks - rounded) > 0.000001 || rounded < -2_147_483_648 || rounded > 2_147_483_647) {
    return { ok: false, fieldErrors: { amount: "Укажите сумму до 21 474 836,47 ₽ с точностью до копейки" } };
  }
  if (typeof comment !== "string" || !comment.trim() || comment.trim().length > 500) {
    return { ok: false, fieldErrors: { comment: "Укажите причину операции (до 500 символов)" } };
  }
  const prisma = getPrisma();
  try {
    await prisma.balanceTransaction.create({
      data: {
        siteId: slug,
        type: amountRub >= 0 ? "topup" : "adjustment",
        amount: rounded,
        comment: `Ручная операция: ${comment.trim()}`,
      },
    });
  } catch {
    return { ok: false, error: "Операция не записана. Попробуйте ещё раз." };
  }
  // Переоценка состояния произойдёт при следующем billing-daily
  revalidatePath(`/admin/sites/${slug}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function setTariff(slug: string, tariffId: string | null): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.site.update({ where: { slug }, data: { tariffId } });
  revalidatePath(`/admin/sites/${slug}`);
}

export async function setSiteState(slug: string, state: "active" | "suspended", comment: string): Promise<void> {
  await guard();
  if (!["active", "suspended"].includes(state) || typeof comment !== "string" || !comment.trim()) throw new Error("Укажите состояние и причину");
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.site.update({
      where: { slug },
      data: { state, manualSuspended: state === "suspended", stateChangedAt: new Date() },
    });
    await tx.balanceTransaction.create({
      data: { siteId: slug, type: "adjustment", amount: 0, comment: `Ручное состояние → ${state}: ${comment.trim()}` },
    });
  });
  revalidatePath(`/admin/sites/${slug}`);
  revalidatePath("/admin");
}

/** Владелец платформы тоже может заказать экспорт сайта (обрабатывает cron на хосте). */
export async function requestSiteExport(slug: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const { exportRequestData } = await import("@/lib/export-access");
  await prisma.site.update({ where: { slug }, data: exportRequestData(new Date()) });
  revalidatePath(`/admin/sites/${slug}`);
}
