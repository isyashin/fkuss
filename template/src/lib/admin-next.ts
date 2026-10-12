/**
 * Валидация параметра next для входа в админку: разрешаем только маршруты
 * своего дерева /admin и строгий набор query-параметров. Всё остальное —
 * внешние ссылки, схемы, //, обратные слэши, управляющие символы — отклоняем:
 * после входа идём на next, поэтому сюда нельзя пускать открытый редирект.
 */

// Путь админки: /admin, /admin/bookings, /admin/settings, сегменты из строчных латинских букв/цифр/дефисов
const NEXT_PATH = /^\/admin(\/[a-z0-9-]+)*\/?$/;
// Query: строгий алфавит без слэшей и обратных слэшей (закодированных тоже)
const NEXT_QUERY = /^[a-zA-Z0-9=&%_.-]{0,240}$/;

export function validateAdminNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length > 300) return null;
  if (/[\x00-\x1f\x7f]/.test(raw)) return null;
  if (raw.includes("\\") || raw.includes("//")) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("%5c") || lower.includes("%2f")) return null; // закодированные слэш/бэкслеш
  const qIndex = raw.indexOf("?");
  const path = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const query = qIndex === -1 ? "" : raw.slice(qIndex + 1);
  if (!NEXT_PATH.test(path)) return null;
  if (query && !NEXT_QUERY.test(query)) return null;
  return raw;
}

/** Безопасный адрес после входа: валидный next или корень админки. */
export function adminLandingNext(raw: string | null | undefined): string {
  return validateAdminNext(raw) ?? "/admin";
}
