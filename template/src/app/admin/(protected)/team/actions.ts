"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/db";
import { createAdminUser, updateAdminUser, type AdminRole } from "@/lib/admin-users";

export type TeamActionResult = { ok: true } | { ok: false; error: string };

/* Ошибки server actions в production доходят до клиента без текста (только digest),
   поэтому ожидаемые ошибки возвращаем значением, а не бросаем. */
function toErrorResult(error: unknown, fallback: string): { ok: false; error: string } {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return { ok: false, error: "Такой логин уже занят" };
  }
  if (error instanceof ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? fallback };
  }
  if (error instanceof Error && error.message) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: fallback };
}

async function guard(): Promise<TeamActionResult | null> {
  if (!(await isAdmin("manage"))) return { ok: false, error: "Недостаточно прав" };
  return null;
}

export async function createTeamUser(input: { login: string; name: string; role: AdminRole; password: string }): Promise<TeamActionResult> {
  const denied = await guard();
  if (denied) return denied;
  try {
    await createAdminUser(getPrisma(), input);
  } catch (error) {
    return toErrorResult(error, "Не удалось добавить сотрудника");
  }
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function changeTeamUser(userId: string, input: { name?: string; role?: AdminRole; active?: boolean; password?: string }): Promise<TeamActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!userId || userId.length > 128) return { ok: false, error: "Неверный сотрудник" };
  try {
    await updateAdminUser(getPrisma(), userId, input);
  } catch (error) {
    return toErrorResult(error, "Не удалось сохранить сотрудника");
  }
  revalidatePath("/admin/team");
  return { ok: true };
}

/** Отзыв подписки конкретного устройства сотрудника (потерянный телефон). */
export async function revokePushDevice(subscriptionId: string): Promise<TeamActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!subscriptionId || subscriptionId.length > 128) return { ok: false, error: "Неверное устройство" };
  const prisma = getPrisma();
  const subscription = await prisma.adminPushSubscription.findUnique({ where: { id: subscriptionId }, select: { id: true } });
  if (!subscription) return { ok: false, error: "Устройство не найдено" };
  await prisma.adminPushSubscription.updateMany({ where: { id: subscription.id, revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath("/admin/settings");
  return { ok: true };
}
