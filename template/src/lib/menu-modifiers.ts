/**
 * Группы модификаторов блюд: чистые помощники для админских server actions.
 * Guards лимитов — здесь, чтобы покрыть unit-тестами.
 */

/** Витрина трактует maxSelected >= 99 как «без верхнего лимита». */
export const MODIFIER_MAX_UNLIMITED = 99;

export const MODIFIER_GROUP_LIMITS_MESSAGE = "Некорректные лимиты выбора группы: минимум не больше максимума, максимум от 1 до 99.";

/** Проверка min/max выбора группы перед записью в БД. */
export function assertModifierGroupLimits(minSelected: number, maxSelected: number): void {
  if (
    !Number.isInteger(minSelected) || !Number.isInteger(maxSelected) ||
    minSelected < 0 || maxSelected < 1 || maxSelected > MODIFIER_MAX_UNLIMITED ||
    minSelected > maxSelected
  ) {
    throw new Error(MODIFIER_GROUP_LIMITS_MESSAGE);
  }
}

/** Обязательная группа (выбор минимум 1) по флагу владельца. */
export function requiredToMinSelected(required: boolean): number {
  return required ? 1 : 0;
}
