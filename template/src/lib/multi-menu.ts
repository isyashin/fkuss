/**
 * Мультименю: чистые помощники группировки и снимка группы в заказе.
 * Используются витриной (PR2) и сервером заказа.
 */

export interface MenuGroupRef {
  id: string;
  name: string;
}

/** Название группы меню для снимка в позиции заказа ("" = без группы). */
export function resolveMenuName(menus: MenuGroupRef[], menuId: string | null | undefined): string {
  if (!menuId) return "";
  return menus.find((m) => m.id === menuId)?.name ?? "";
}

export interface GroupedCategories<T> {
  menu: MenuGroupRef | null; // null = категории вне групп
  categories: T[];
}

/** Категории, сгруппированные по меню (порядок меню сохраняется). */
export function groupCategoriesByMenu<T extends { menuId?: string }>(
  menus: MenuGroupRef[],
  categories: T[],
): GroupedCategories<T>[] {
  const groups: GroupedCategories<T>[] = menus.map((menu) => ({ menu, categories: [] }));
  const ungrouped: T[] = [];
  for (const category of categories) {
    const group = category.menuId ? groups.find((g) => g.menu?.id === category.menuId) : undefined;
    if (group) group.categories.push(category);
    else ungrouped.push(category);
  }
  const result = groups.filter((g) => g.categories.length > 0);
  if (ungrouped.length > 0) result.push({ menu: null, categories: ungrouped });
  return result;
}

export interface SyncSource {
  placeSlug: string;
  /** Группа меню для категорий этого источника; null = вне групп. */
  menuId: string | null;
}

/** Нормализация настроек синхронизации: легаси placeSlug → единственный источник. */
export function syncSources(sync: {
  sources?: { placeSlug: string; menuId?: string }[];
  placeSlug?: string;
}): SyncSource[] {
  const sources = (sync.sources ?? [])
    .filter((s) => s.placeSlug.trim())
    .map((s) => ({ placeSlug: s.placeSlug.trim(), menuId: s.menuId || null }));
  if (sources.length > 0) return sources;
  return sync.placeSlug?.trim() ? [{ placeSlug: sync.placeSlug.trim(), menuId: null }] : [];
}

/**
 * Пункты переключателя меню на витрине. Пустой результат = переключатель
 * не показываем вовсе (сайты без групп меню — прежний вид, один ряд табов).
 * Незагруппированные категории получают пункт «Меню» ТОЛЬКО в мультименю-режиме;
 * группы без категорий скрываем.
 */
export function menuSwitchItems<T extends { menuId?: string }>(
  menus: MenuGroupRef[],
  categories: T[],
): MenuGroupRef[] {
  if (menus.length === 0) return [];
  const items = menus.filter((m) => categories.some((c) => (c.menuId ?? "") === m.id));
  if (categories.some((c) => !(c.menuId ?? ""))) items.push({ id: "", name: "Меню" });
  return items;
}
