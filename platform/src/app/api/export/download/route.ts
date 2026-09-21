import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveExportArchive } from "@/lib/export-access";
import { getSessionOwner } from "@/lib/owner-auth";
import { getPrisma } from "@/lib/db";

/** Скачивание готового архива экспорта (владелец сайта) */
export async function GET() {
  const owner = await getSessionOwner();
  if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const prisma = getPrisma();
  const site = await prisma.site.findUnique({ where: { slug: owner.siteId } });
  const readyPath = site?.exportReadyPath;
  if (!readyPath) {
    return NextResponse.json({ error: "Экспорт ещё не готов" }, { status: 404 });
  }

  const exportDir = process.env.EXPORT_DIR ?? "/srv/resto/backups/export";
  const abs = resolveExportArchive(exportDir, readyPath, owner.siteId);
  if (!abs) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // O_NOFOLLOW не позволяет заменить архив симлинком на файл за пределами exportDir.
    const file = await open(abs, constants.O_RDONLY | constants.O_NOFOLLOW);
    const fileStat = await file.stat();
    if (!fileStat.isFile()) {
      await file.close();
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }
    const stream = file.createReadStream();
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(fileStat.size),
        "Content-Disposition": `attachment; filename="${path.basename(abs)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
}
