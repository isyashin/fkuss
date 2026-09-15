"use server";

import { headers } from "next/headers";
import { requestOwnerCode, verifyOwnerCode } from "@/lib/owner-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function requestCodeAction(email: string): Promise<{ devCode?: string; error?: string }> {
  const normalized = email.toLowerCase().trim();
  if (!rateLimit(`pcode:email:${normalized}`, 1, 60_000)) {
    return { error: "Код уже отправлен. Подождите минуту." };
  }
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`pcode:ip:${ip}`, 5, 3600_000)) {
    return { error: "Слишком много запросов. Попробуйте позже." };
  }
  return requestOwnerCode(normalized);
}

export async function verifyCodeAction(email: string, code: string) {
  return verifyOwnerCode(email.toLowerCase().trim(), code);
}
