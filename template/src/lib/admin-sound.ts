import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { getContentDir, resolveContentPath } from "./content-dir";
import { DEFAULT_SOUND_REPEATS, MAX_SOUND_REPEATS, MIN_SOUND_REPEATS } from "./admin-sound-constants";

export type AdminSoundChoice = "standard1" | "standard2" | "site" | "custom";
export type AdminSound = { selected: AdminSoundChoice; customName: string; customPath: string; repeats: number };
export type PublicAdminSound = { selected: AdminSoundChoice; customName: string; customUrl: string; repeats: number };

const DEFAULT_SOUND: AdminSound = { selected: "standard1", customName: "", customPath: "", repeats: DEFAULT_SOUND_REPEATS };
const CUSTOM_PATH = /^audio\/admin-[a-f0-9]{32}\.(mp3|wav|ogg)$/;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/** Сколько раз повторять сигнал о новом заказе/брони (1–20). Мусор → дефолт 10. */
export function parseSoundRepeats(value: unknown): number {
  const n = typeof value === "number" ? Math.round(value) : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < MIN_SOUND_REPEATS) return DEFAULT_SOUND.repeats;
  return Math.min(n, MAX_SOUND_REPEATS);
}

export function parseAdminSound(value: unknown): AdminSound {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SOUND };
  const data = value as Record<string, unknown>;
  const customPath = typeof data.customPath === "string" && CUSTOM_PATH.test(data.customPath) ? data.customPath : "";
  const customName = customPath && typeof data.customName === "string" ? data.customName.slice(0, 100) : "";
  const selected = data.selected === "standard2" ? "standard2" : data.selected === "site" ? "site" : data.selected === "custom" && customPath ? "custom" : "standard1";
  return { selected, customName, customPath, repeats: parseSoundRepeats(data.repeats) };
}

export function soundAfterRemovingCustom(current: AdminSound): AdminSound {
  return { ...current, selected: "standard1", customName: "", customPath: "" };
}

export function publicAdminSound(sound: AdminSound): PublicAdminSound {
  return { selected: sound.selected, customName: sound.customName,
    customUrl: sound.customPath ? `/api/admin/sound?file=1&v=${encodeURIComponent(sound.customPath)}` : "",
    repeats: sound.repeats };
}

export function detectAdminAudio(bytes: Buffer, contentType: string, size: number): { extension: "mp3" | "wav" | "ogg"; mime: string } | null {
  if (size < 6 || size > MAX_AUDIO_BYTES) return null;
  const type = contentType.toLowerCase().split(";")[0].trim();
  if (["audio/mpeg", "audio/mp3"].includes(type) &&
    (bytes.subarray(0, 3).toString("ascii") === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) {
    return { extension: "mp3", mime: "audio/mpeg" };
  }
  if (["audio/wav", "audio/x-wav", "audio/wave"].includes(type) && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") {
    return { extension: "wav", mime: "audio/wav" };
  }
  if (type === "audio/ogg" && bytes.subarray(0, 4).toString("ascii") === "OggS") {
    return { extension: "ogg", mime: "audio/ogg" };
  }
  return null;
}

export async function readAdminSound(prisma: PrismaClient): Promise<AdminSound> {
  const row = await prisma.settings.findUnique({ where: { key: "adminSound" } });
  return parseAdminSound(row?.value);
}

async function mutateAdminSound(prisma: PrismaClient, change: (current: AdminSound) => AdminSound): Promise<{ previous: AdminSound; next: AdminSound }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin-sound'))`;
    const row = await tx.settings.findUnique({ where: { key: "adminSound" } });
    const previous = parseAdminSound(row?.value);
    const next = change(previous);
    await tx.settings.upsert({ where: { key: "adminSound" }, create: { key: "adminSound", value: next }, update: { value: next } });
    return { previous, next };
  });
}

async function removeStoredSound(relativePath: string): Promise<void> {
  if (!CUSTOM_PATH.test(relativePath)) return;
  const absolute = resolveContentPath(relativePath);
  if (absolute) await unlink(absolute).catch(() => {});
}

export async function selectAdminSound(prisma: PrismaClient, choice: AdminSoundChoice): Promise<PublicAdminSound> {
  if (!["standard1", "standard2", "site", "custom"].includes(choice)) throw new Error("Неизвестный звук");
  const { next } = await mutateAdminSound(prisma, (current) => {
    if (choice === "custom" && !current.customPath) throw new Error("Сначала загрузите звуковой файл");
    return { ...current, selected: choice };
  });
  return publicAdminSound(next);
}

/** Сколько раз повторять сигнал (1–20): настройка в карточке звука. */
export async function saveAdminSoundRepeats(prisma: PrismaClient, repeats: number): Promise<PublicAdminSound> {
  const { next } = await mutateAdminSound(prisma, (current) => ({ ...current, repeats: parseSoundRepeats(repeats) }));
  return publicAdminSound(next);
}

export async function removeAdminSound(prisma: PrismaClient): Promise<PublicAdminSound> {
  const { previous, next } = await mutateAdminSound(prisma, soundAfterRemovingCustom);
  await removeStoredSound(previous.customPath);
  return publicAdminSound(next);
}

export async function uploadAdminSound(prisma: PrismaClient, file: File): Promise<PublicAdminSound> {
  if (file.size > MAX_AUDIO_BYTES) throw new Error("Файл больше 2 МБ");
  const bytes = Buffer.from(await file.arrayBuffer());
  const format = detectAdminAudio(bytes, file.type, file.size);
  if (!format) throw new Error("Нужен MP3, WAV или Ogg до 2 МБ");
  const relativePath = `audio/admin-${randomBytes(16).toString("hex")}.${format.extension}`;
  const absolutePath = resolveContentPath(relativePath);
  if (!absolutePath) throw new Error("Недопустимый путь файла");
  await mkdir(path.join(getContentDir(), "audio"), { recursive: true });
  await writeFile(absolutePath, bytes, { flag: "wx" });
  let previous: AdminSound;
  let next: AdminSound;
  try {
    ({ previous, next } = await mutateAdminSound(prisma, (current) => ({
      ...current, selected: "custom", customName: path.basename(file.name).slice(0, 100), customPath: relativePath,
    })));
  } catch (error) {
    await removeStoredSound(relativePath);
    throw error;
  }
  if (previous.customPath && previous.customPath !== relativePath) await removeStoredSound(previous.customPath);
  return publicAdminSound(next);
}
