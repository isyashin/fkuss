"use server";

import { redirect } from "next/navigation";
import { logoutAdmin } from "@/lib/admin-auth";

export async function logoutAction(formData?: FormData): Promise<void> {
  const installId = formData?.get("installId");
  await logoutAdmin(typeof installId === "string" ? installId : undefined);
  redirect("/admin/login");
}
