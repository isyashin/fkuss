import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getContentDir } from "@/lib/content-dir";
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
  if (!["dishes", "gallery", "promos", "background", "logo"].includes(section)) {
    return NextResponse.json({ error: "Недопустимый раздел" }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return NextResponse.json({ error: "Недопустимое имя файла" }, { status: 400 });
  }
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    return NextResponse.json({ error: "SVG не принимается" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Файл больше 8 МБ" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dir = path.join(getContentDir(), "images", section);
  await mkdir(dir, { recursive: true });

  if (section === "dishes") {
    // Два размера: карточный (-sm 400px) и полный (800px)
    await writeFile(
      path.join(dir, `${name}-sm.webp`),
      await sharp(buffer).resize(400, 400, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    );
    await writeFile(
      path.join(dir, `${name}.webp`),
      await sharp(buffer).resize(800, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    );
  } else if (section === "background") {
    // Фон: широкий, качество поаккуратнее
    await writeFile(
      path.join(dir, `${name}.webp`),
      await sharp(buffer).resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    );
  } else if (section === "logo") {
    // Логотип — всегда images/logo.png (PNG для иконок)
    const logoPath = path.join(getContentDir(), "images", "logo.png");
    await mkdir(path.dirname(logoPath), { recursive: true });
    await writeFile(logoPath, await sharp(buffer).resize(1024, 1024, { fit: "inside" }).png().toBuffer());
    const relPathLogo = "images/logo.png";
    return NextResponse.json({ ok: true, path: relPathLogo });
  } else {
    await writeFile(
      path.join(dir, `${name}.webp`),
      await sharp(buffer).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    );
  }

  const relPath = `images/${section}/${name}.webp`;
  return NextResponse.json({ ok: true, path: relPath });
}
