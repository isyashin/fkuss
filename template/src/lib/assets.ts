/** Клиент-безопасный хелпер: URL файла из content/ через /content-asset */
export function contentAssetUrl(relPath: string): string {
  return `/content-asset/${relPath}`;
}

/**
 * Оптимизированная картинка блюда: size "sm" — карточка (400px, *-sm.webp),
 * "full" — модалка (800px). Если -sm отсутствует (старые сайты), отдаём full.
 */
export function dishImageUrl(relPath: string, size: "sm" | "full" = "full"): string {
  if (!relPath) return "";
  if (size === "sm" && relPath.endsWith(".webp")) {
    return contentAssetUrl(relPath.replace(/\.webp$/, "-sm.webp"));
  }
  return contentAssetUrl(relPath);
}
