import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getAdminActor, isAdmin } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/db";
import { resolveContentFile } from "@/lib/content-dir";
import { publicAdminSound, readAdminSound, removeAdminSound, selectAdminSound, uploadAdminSound, type AdminSoundChoice } from "@/lib/admin-sound";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getAdminActor())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sound = await readAdminSound(getPrisma());
  if (new URL(request.url).searchParams.get("file") !== "1") return NextResponse.json(publicAdminSound(sound), { headers: { "Cache-Control": "no-store" } });
  if (!sound.customPath) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const absolute = await resolveContentFile(sound.customPath);
  if (!absolute) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const mime = sound.customPath.endsWith(".mp3") ? "audio/mpeg" : sound.customPath.endsWith(".wav") ? "audio/wav" : "audio/ogg";
  const bytes = await readFile(absolute);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Content-Length": String(bytes.length),
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin("manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(await selectAdminSound(getPrisma(), body?.selected as AdminSoundChoice));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось выбрать звук" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin("manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Выберите аудиофайл" }, { status: 400 });
  try {
    return NextResponse.json(await uploadAdminSound(getPrisma(), file));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить файл" }, { status: 400 });
  }
}

export async function DELETE() {
  if (!(await isAdmin("manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await removeAdminSound(getPrisma()));
}
