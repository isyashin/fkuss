export type DraftPreviewLine =
  | { kind: "existing"; quantity: number; item: { price: number; modifiers: unknown } }
  | { kind: "new"; quantity: number; dishId: string; modifierIds: string[] };
export type DraftPreviewDish = {
  price: number;
  modifiers: { id: string; price: number }[];
  groups: { modifiers: { id: string; price: number }[] }[];
};

export function adminDraftLineUnit(line: DraftPreviewLine, dishes: Map<string, DraftPreviewDish>): number {
  if (line.kind === "existing") {
    const modifiers = Array.isArray(line.item.modifiers) ? line.item.modifiers as { price?: number }[] : [];
    return line.item.price + modifiers.reduce((sum, modifier) => sum + (modifier.price ?? 0), 0);
  }
  const dish = dishes.get(line.dishId);
  if (!dish) return 0;
  const modifiers = [...dish.modifiers, ...dish.groups.flatMap((group) => group.modifiers)];
  return dish.price + modifiers.filter((modifier) => line.modifierIds.includes(modifier.id))
    .reduce((sum, modifier) => sum + modifier.price, 0);
}

export function adminDraftItemsTotal(lines: DraftPreviewLine[], dishes: Map<string, DraftPreviewDish>): number {
  return lines.reduce((sum, line) => sum + adminDraftLineUnit(line, dishes) * line.quantity, 0);
}
