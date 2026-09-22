import path from "node:path";
import { lstat, realpath } from "node:fs/promises";

/** Абсолютный корень runtime-контента текущего tenant-а. */
export function getContentDir(): string {
  const configured = process.env.CONTENT_DIR?.trim();
  // Runtime content is mounted separately from the standalone bundle.
  return path.resolve(/*turbopackIgnore: true*/ configured || path.join(process.cwd(), "content"));
}

/** Безопасно строит путь внутри content; возвращает null при traversal. */
export function resolveContentPath(relativePath: string): string | null {
  if (!relativePath) return null;
  const root = getContentDir();
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return candidate;
}

/** Возвращает реальный обычный файл внутри content, не следуя наружу по symlink. */
export async function resolveContentFile(relativePath: string): Promise<string | null> {
  const candidate = resolveContentPath(relativePath);
  if (!candidate) return null;
  try {
    const [root, info] = await Promise.all([
      realpath(/*turbopackIgnore: true*/ getContentDir()),
      lstat(/*turbopackIgnore: true*/ candidate),
    ]);
    if (!info.isFile() || info.isSymbolicLink()) return null;
    const actual = await realpath(/*turbopackIgnore: true*/ candidate);
    const relative = path.relative(root, actual);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return actual;
  } catch {
    return null;
  }
}
