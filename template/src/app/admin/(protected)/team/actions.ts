"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/db";
import { createAdminUser, updateAdminUser, type AdminRole } from "@/lib/admin-users";

async function guard() {
  if (!(await isAdmin("manage"))) throw new Error("Недостаточно прав");
}

export async function createTeamUser(input: { login: string; name: string; role: AdminRole; password: string }): Promise<void> {
  await guard();
  try {
    await createAdminUser(getPrisma(), input);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new Error("Такой логин уже занят");
    throw error;
  }
  revalidatePath("/admin/team");
}

export async function changeTeamUser(userId: string, input: { name?: string; role?: AdminRole; active?: boolean; password?: string }): Promise<void> {
  await guard();
  if (!userId || userId.length > 128) throw new Error("Неверный сотрудник");
  await updateAdminUser(getPrisma(), userId, input);
  revalidatePath("/admin/team");
}
