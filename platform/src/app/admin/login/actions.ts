"use server";

import { headers } from "next/headers";
import { loginPlatformAdmin } from "@/lib/platform-admin-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function loginAction(password: string): Promise<boolean> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`padmin:${ip}`, 10, 10 * 60 * 1000)) return false;
  return loginPlatformAdmin(password);
}
