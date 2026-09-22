import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveContentFile, resolveContentPath } from "@/lib/content-dir";
import { NextResponse } from "next/server";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/** Отдача файлов из content/ (картинки блюд, галереи, логотип) */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const relPath = segments.join("/");
  if (!resolveContentPath(relPath)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const absPath = await resolveContentFile(relPath);
    if (!absPath) throw new Error("not a safe file");
    const ext = path.extname(absPath).toLowerCase();
    const contentType = MIME[ext];
    if (!contentType) throw new Error("unsupported content asset type");
    // Загрузчик ограничивает файл 8 МБ. Буфер не создаёт ложную серверную
    // ошибку, когда браузер отменяет загрузку картинки при навигации.
    const body = new Uint8Array(await readFile(absPath));
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
        "X-Content-Type-Options": "nosniff",
        // Картинки контента меняются редко; при замене меняется имя файла
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
