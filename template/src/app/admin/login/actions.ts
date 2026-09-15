"use server";

import { headers } from "next/headers";
import { loginAdmin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function loginAction(password: string): Promise<boolean> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`admin:${ip}`, 10, 10 * 60 * 1000)) return false;
  return loginAdmin(password);
}
