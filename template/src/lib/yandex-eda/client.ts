/**
 * Изолированный клиент неофициального API Яндекс.Еды.
 * Нестабильная внешняя зависимость: timeout, нормализация, без секретов в логах.
 * В тестах подменяется fixture-ами (fetch не вызывается).
 */

const EDA_HOST = "https://eda.yandex.ru";
const TIMEOUT_MS = 10_000;

export interface EdaModifierOption {
  externalId: string;
  name: string;
  price: number | null;
}

export interface EdaModifierGroup {
  externalId: string;
  name: string;
  position: number;
  minSelected: number;
  maxSelected: number;
  options: EdaModifierOption[];
}

export interface EdaDish {
  externalId: string;
  categoryExternalId: string;
  categoryName: string;
  categoryPosition: number;
  name: string;
  description: string;
  price: number | null;
  available: boolean;
  weight: string;
  imageUrl: string | null;
  groups: EdaModifierGroup[];
}

export interface EdaMenu {
  dishes: EdaDish[];
}

const SKIP_CATEGORIES = new Set(["Что нового", "Выбор пользователей"]);

function imageUrl(uri: string | undefined, size = "800x800"): string | null {
  if (!uri) return null;
  return `${EDA_HOST}${uri.replace("{w}x{h}", size)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`Яндекс.Еда: HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface RawItem {
  id: number;
  name: string;
  description?: string;
  available?: boolean;
  inStock?: boolean | null;
  price?: number | null;
  weight?: string;
  picture?: { uri?: string };
  optionsGroups?: {
    id: number;
    name: string;
    required?: boolean;
    minSelected?: number;
    maxSelected?: number;
    options?: { id: number; name: string; price?: number | null }[];
  }[];
}

interface RawCategory {
  id: number;
  name: string;
  available?: boolean;
  items?: RawItem[];
}

/** Загрузка и нормализация меню ресторана по placeSlug */
export async function fetchEdaMenu(placeSlug: string): Promise<EdaMenu> {
  const data = await fetchJson<{ payload: { categories: RawCategory[] } }>(
    `${EDA_HOST}/api/v2/menu/retrieve/${encodeURIComponent(placeSlug)}?autoTranslate=false`,
  );

  const dishes: EdaDish[] = [];
  let position = 0;
  for (const category of data.payload.categories) {
    if (category.available === false) continue;
    if (SKIP_CATEGORIES.has(category.name)) continue;
    if (!category.items?.length) continue;

    for (const item of category.items) {
      dishes.push({
        externalId: String(item.id),
        categoryExternalId: String(category.id),
        categoryName: category.name,
        categoryPosition: position,
        name: item.name,
        description: item.description ?? "",
        price: item.price != null ? Math.round(item.price) : null,
        available: item.available !== false && item.inStock !== false,
        weight: item.weight ?? "",
        imageUrl: imageUrl(item.picture?.uri),
        groups: (item.optionsGroups ?? []).map((g, gi) => ({
          externalId: String(g.id),
          name: g.name,
          position: gi,
          minSelected: g.minSelected ?? (g.required ? 1 : 0),
          maxSelected: g.maxSelected ?? 99,
          options: (g.options ?? []).map((o) => ({
            externalId: String(o.id),
            name: o.name,
            price: o.price != null ? Math.round(o.price) : null,
          })),
        })),
      });
    }
    position++;
  }

  return { dishes };
}
