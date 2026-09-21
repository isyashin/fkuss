import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
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

  const abs = path.resolve(readyPath);
  if (!abs.startsWith(path.resolve("/home/ilya/resto/backups/export"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fileStat = await stat(abs);
    const stream = createReadStream(abs);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(fileStat.size),
        "Content-Disposition": `attachment; filename="${path.basename(abs)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
}
