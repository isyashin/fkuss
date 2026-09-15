import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isAdmin } from "@/lib/admin-auth";

/** Загрузка фото: sharp → WebP (max 1600px), в content/images/<section>/<name>.webp */
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const section = String(form.get("section") ?? "dishes");
  const name = String(form.get("name") ?? `img-${Date.now().toString(36)}`);

  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Нужен файл изображения" }, { status: 400 });
  }
  if (!["dishes", "gallery", "promos"].includes(section)) {
    return NextResponse.json({ error: "Недопустимый раздел" }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return NextResponse.json({ error: "Недопустимое имя файла" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const webp = await sharp(buffer)
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const relPath = `images/${section}/${name}.webp`;
  const absPath = path.join(process.cwd(), "content", relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, webp);

  return NextResponse.json({ ok: true, path: relPath });
}
