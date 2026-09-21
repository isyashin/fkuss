/** Доступ к архивам экспорта сайта: имена, владение, состояние запроса. */

const ARCHIVE_NAME_RE = /^[a-z0-9][a-z0-9-]*-\d{8}-\d{6}\.tar\.gz$/;

/**
 * Возвращает путь к архиву внутри exportDir, если storedName — безопасное
 * переносимое имя (`<slug>-YYYYMMDD-HHMMSS.tar.gz`). Иначе null: путь наружу,
 * незавершённый (.partial) или посторонний файл отклоняются.
 */
export function resolveExportArchive(exportDir: string, storedName: string): string | null {
  if (!ARCHIVE_NAME_RE.test(storedName)) return null;
  if (storedName.includes("/") || storedName.includes("\\") || storedName.includes("\0")) {
    return null;
  }
  const dir = exportDir.endsWith("/") ? exportDir.slice(0, -1) : exportDir;
  return `${dir}/${storedName}`;
}

/** Владелец может запрашивать экспорт только своего сайта. */
export function canRequestExport(ownerSiteId: string, requestedSlug: string): boolean {
  return ownerSiteId === requestedSlug;
}

/** Новый запрос экспорта сбрасывает предыдущий готовый архив. */
export function exportRequestData(requestedAt: Date): {
  exportRequestedAt: Date;
  exportReadyPath: null;
} {
  return { exportRequestedAt: requestedAt, exportReadyPath: null };
}
