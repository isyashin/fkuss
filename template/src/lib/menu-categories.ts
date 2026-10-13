/**
 * Категории меню: чистые помощники для админских server actions.
 * Логика guards и обмена позициями — здесь, чтобы покрыть unit-тестами.
 */

/** Понятная ошибка при попытке удалить непустую категорию. */
export const CATEGORY_HAS_DISHES_MESSAGE = "В категории есть блюда. Сначала удалите их или перенесите в другую категорию.";

/** Категорию с блюдами удалять нельзя — иначе потеряем блюда вместе с ней. */
export function assertCategoryDeletable(dishCount: number): void {
  if (dishCount > 0) throw new Error(CATEGORY_HAS_DISHES_MESSAGE);
}

export type CategoryDirection = "up" | "down";

export interface CategoryPositionRow {
  id: string;
  position: number;
}

/**
 * Обмен позициями категории с соседней внутри её группы меню.
 * `ordered` — категории одной группы (menuId совпадает), отсортированные по position.
 * Пустой результат — категория на краю списка или не найдена (действие не требуется).
 */
export function categoryReorderUpdates(
  ordered: CategoryPositionRow[],
  id: string,
  direction: CategoryDirection,
): CategoryPositionRow[] {
  const index = ordered.findIndex((category) => category.id === id);
  if (index < 0) return [];
  const neighbor = direction === "up" ? ordered[index - 1] : ordered[index + 1];
  if (!neighbor) return [];
  const current = ordered[index];
  return [
    { id: current.id, position: neighbor.position },
    { id: neighbor.id, position: current.position },
  ];
}

/** Активный фильтр админ-списка меню (поиск + доступность). */
export interface AdminMenuListFilter {
  needle: string;
  availability: "all" | "available" | "unavailable";
}

interface AdminListDish {
  name: string;
  description: string;
  composition: string;
  available: boolean;
}

/** Блюдо проходит фильтр админ-списка (доступность + поисковая строка). */
export function dishMatchesAdminFilter(dish: AdminListDish, filter: AdminMenuListFilter): boolean {
  if (filter.availability === "available" && !dish.available) return false;
  if (filter.availability === "unavailable" && dish.available) return false;
  const needle = filter.needle.trim().toLocaleLowerCase("ru");
  if (!needle) return true;
  return [dish.name, dish.description, dish.composition].some((value) => value.toLocaleLowerCase("ru").includes(needle));
}

/**
 * Категории с отфильтрованными блюдами для админ-списка меню. Пустые категории
 * (без блюд вовсе) видны всегда: на витрине они скрыты (visibleMenuCategories),
 * но в админке ими нужно управлять (↑↓ ✎ 🗑). Категории с блюдами скрываем,
 * только если фильтр не оставил в них ни одного блюда; выбранная в селекте
 * категория показывается всегда (с пометкой об отсутствии блюд).
 */
export function filterAdminMenuCategories<T extends { id: string; dishes: AdminListDish[] }>(
  categories: T[],
  filter: AdminMenuListFilter,
  keepCategoryId?: string,
): T[] {
  return categories
    .map((category) => ({ category, dishes: category.dishes.filter((dish) => dishMatchesAdminFilter(dish, filter)) }))
    .filter((row) => row.dishes.length > 0 || row.category.dishes.length === 0 || row.category.id === keepCategoryId)
    .map((row) => ({ ...row.category, dishes: row.dishes }));
}
