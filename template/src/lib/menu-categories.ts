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
