"use server";

import { headers } from "next/headers";
import { loginAdmin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function loginAction(login: string, password: string): Promise<boolean> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Лимит защищает от перебора; для E2E-прутков задаётся env (по умолчанию 10/10 мин).
  const attempts = Math.max(1, Number(process.env.ADMIN_LOGIN_ATTEMPTS ?? "10") || 10);
  if (!rateLimit(`admin:${ip}`, attempts, 10 * 60 * 1000)) return false;
  return loginAdmin(login, password);
}
