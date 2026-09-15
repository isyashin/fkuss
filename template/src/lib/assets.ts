/** Клиент-безопасный хелпер: URL файла из content/ через /content-asset */
export function contentAssetUrl(relPath: string): string {
  return `/content-asset/${relPath}`;
}
