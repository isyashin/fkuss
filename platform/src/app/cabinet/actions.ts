"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requestOwnerCode, verifyOwnerCode, getSessionOwner } from "@/lib/owner-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getPrisma } from "@/lib/db";

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

/** Канал уведомлений о балансе (email | telegram) + chat id для Telegram. */
export async function setNotifyChannelAction(channel: string, telegramChatId: string): Promise<{ ok: boolean; error?: string }> {
  const owner = await getSessionOwner();
  if (!owner) return { ok: false, error: "Нет сессии" };
  if (channel !== "email" && channel !== "telegram") return { ok: false, error: "Неизвестный канал" };
  if (channel === "telegram" && !/^\d{3,20}$/.test(telegramChatId.trim())) {
    return { ok: false, error: "Укажите числовой chat id Telegram (напишите боту @userinfobot)" };
  }
  const prisma = getPrisma();
  await prisma.ownerAccount.update({
    where: { id: owner.id },
    data: { notifyChannel: channel, notifyTelegramChatId: channel === "telegram" ? telegramChatId.trim() : "" },
  });
  revalidatePath("/cabinet");
  return { ok: true };
}
