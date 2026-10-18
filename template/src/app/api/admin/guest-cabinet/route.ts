import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/site";
import { getSmtpConfig, normalizeGuestCabinet, type GuestCabinetSettings } from "@/lib/guest-cabinet";
import { sendMail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  authMode: z.enum(["screen", "email"]).optional(),
  smtpUrl: z.string().optional(),
  smtpFrom: z.string().optional(),
});

async function saveGuestCabinet(patch: Partial<GuestCabinetSettings>): Promise<{ cabinet: GuestCabinetSettings; rev: number }> {
  const prisma = getPrisma();
  const current = await getSiteSettings();
  const guestCabinet = { ...normalizeGuestCabinet(current), ...patch };
  // Единая точка записи строки settings: общая блокировка и бамп _rev
  // (P1, аудит 11.10). Ревизия возвращается клиенту (аудит 12.10).
  const { writeSettingsVersioned } = await import("@/lib/admin-settings-version");
  const rev = await writeSettingsVersioned(prisma, (row) => ({ ...current, ...row, guestCabinet }), null);
  if (rev === "conflict") throw new Error("CONFLICT_WITHOUT_CHECK");
  return { cabinet: guestCabinet, rev };
}

export async function GET() {
  if (!(await isAdmin("manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(normalizeGuestCabinet(await getSiteSettings()), { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request) {
  if (!(await isAdmin("manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  return NextResponse.json(await saveGuestCabinet(parsed.data));
}

/** Тестовое письмо на адрес email-канала — проверяем, что SMTP рабочий. */
export async function POST() {
  if (!(await isAdmin("manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = await getSiteSettings();
  const smtp = getSmtpConfig(normalizeGuestCabinet(settings));
  if (!smtp.url) {
    return NextResponse.json({ error: "SMTP не настроен: заполните SMTP URL и отправителя" }, { status: 400 });
  }
  try {
    await sendMail(settings.channels.email.address, "Тестовое письмо", `SMTP настроен верно. Отправитель: ${smtp.from}.`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: `Не удалось отправить: ${error instanceof Error ? error.message : "ошибка SMTP"}` }, { status: 400 });
  }
}
