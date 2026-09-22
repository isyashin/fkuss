import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

type ReadinessInput = {
  restaurant: { logo: string; phone: string; email: string };
  menu: { categories: { dishes: { image: string }[] }[] };
  promos: { promos: { image: string }[] };
  theme: { background?: { image: string } };
  settings: {
    domains: { canonical: string };
    channels: { email: { address: string } };
  };
};

const DRAFT_PLACEHOLDER = /(?:^\+?70000000000$|^DRAFT[_-]|@example\.(?:ru|com|invalid)$|\.example\.ru$)/i;

export async function checkContentReadiness(contentDir: string, input: ReadinessInput): Promise<string[]> {
  const errors: string[] = [];
  if (DRAFT_PLACEHOLDER.test(input.restaurant.phone) || DRAFT_PLACEHOLDER.test(input.restaurant.email)) {
    errors.push("restaurant: замените draft-контакты (телефон/email) на реальные значения");
  }
  if (DRAFT_PLACEHOLDER.test(input.settings.domains.canonical)) {
    errors.push("settings.domains.canonical: замените draft-домен на реальный или локальный адрес");
  }
  if (DRAFT_PLACEHOLDER.test(input.settings.channels.email.address)) {
    errors.push("settings.channels.email.address: замените draft-email на реальный адрес");
  }

  const root = await realpath(contentDir).catch(() => path.resolve(contentDir));
  const images = [
    ["restaurant.logo", input.restaurant.logo],
    ...input.menu.categories.flatMap((c, ci) => c.dishes.map((d, di) => [`menu.categories.${ci}.dishes.${di}.image`, d.image] as const)),
    ...input.promos.promos.map((p, i) => [`promos.promos.${i}.image`, p.image] as const),
    ["theme.background.image", input.theme.background?.image ?? ""],
  ] as const;
  for (const [field, relative] of images) {
    if (!relative) continue;
    const candidate = path.resolve(root, relative);
    const rel = path.relative(root, candidate);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      errors.push(`${field}: путь выходит за пределы CONTENT_DIR (${relative})`);
      continue;
    }
    try {
      const stat = await lstat(candidate);
      if (!stat.isFile()) errors.push(`${field}: файл не найден или не является обычным файлом (${relative})`);
      const actual = await realpath(candidate);
      const actualRel = path.relative(root, actual);
      if (actualRel.startsWith("..") || path.isAbsolute(actualRel)) errors.push(`${field}: symlink выходит за пределы CONTENT_DIR (${relative})`);
    } catch {
      errors.push(`${field}: файл не найден (${relative})`);
    }
  }
  return errors;
}

export async function assertContentReadiness(contentDir: string, input: ReadinessInput): Promise<void> {
  const errors = await checkContentReadiness(contentDir, input);
  if (errors.length) throw new Error(`Контент не готов к seed:\n${errors.map((e) => `  • ${e}`).join("\n")}`);
}
