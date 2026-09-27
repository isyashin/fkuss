"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function logoutPlatformAdminAction(): Promise<void> {
  (await cookies()).delete("platform_admin");
  redirect("/admin/login");
}

export async function logoutOwnerAction(): Promise<void> {
  (await cookies()).delete("platform_owner");
  redirect("/cabinet");
}
