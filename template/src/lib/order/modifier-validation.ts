/**
 * Валидация выбора модификаторов по группам (min/max).
 * Используется и UI (блюдо нельзя добавить без выполнения min), и сервер заказа.
 */

export interface GroupRule {
  id: string;
  name: string;
  minSelected: number;
  maxSelected: number;
  modifierIds: string[];
}

export type ModifierSelectionResult = { ok: true } | { ok: false; error: string };

export function validateModifierSelection(
  groups: GroupRule[],
  selectedIds: string[],
): ModifierSelectionResult {
  const allIds = new Set(groups.flatMap((g) => g.modifierIds));

  // Чужие ID
  for (const id of selectedIds) {
    if (!allIds.has(id)) {
      return { ok: false, error: `Выбран неизвестный вариант добавки (${id})` };
    }
  }

  // min/max по группам
  for (const group of groups) {
    const inGroup = selectedIds.filter((id) => group.modifierIds.includes(id));
    const unique = new Set(inGroup);
    if (inGroup.length !== unique.size) {
      return { ok: false, error: `В группе «${group.name}» вариант выбран повторно` };
    }
    if (inGroup.length > group.maxSelected) {
      return {
        ok: false,
        error: `В группе «${group.name}» можно выбрать не больше ${group.maxSelected}`,
      };
    }
    if (inGroup.length < group.minSelected) {
      return {
        ok: false,
        error: `В группе «${group.name}» нужно выбрать минимум ${group.minSelected}`,
      };
    }
  }

  return { ok: true };
}
