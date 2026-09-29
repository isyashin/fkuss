"use server";

import { revalidatePath } from "next/cache";
import { isPlatformAdmin } from "@/lib/platform-admin-auth";
import { setTenantOwnerPin } from "@/lib/tenant-api";

/** Смена PIN владельца сайта (в БД сайта через его site-key API). */
export async function setOwnerPinAction(slug: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: "PIN: 4–6 цифр" };
  const result = await setTenantOwnerPin(slug, pin);
  if (result.ok) revalidatePath(`/admin/sites/${slug}`);
  return result;
}
