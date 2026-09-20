import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const CONTENT_DIR = path.join(process.cwd(), "content");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

/** Отдача файлов из content/ (картинки блюд, галереи, логотип) */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const relPath = segments.join("/");
  const absPath = path.join(CONTENT_DIR, relPath);

  // Защита от path traversal и sibling-prefix обхода
  const relative = path.relative(CONTENT_DIR, absPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fileStat = await stat(absPath);
    if (!fileStat.isFile()) throw new Error("not a file");
    const ext = path.extname(absPath).toLowerCase();
    const stream = createReadStream(absPath);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(fileStat.size),
        // Картинки контента меняются редко; при замене меняется имя файла
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
