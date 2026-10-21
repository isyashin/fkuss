/** Бонусная программа включается только явным выбором владельца. */
export function isLoyaltyEnabled(settings: { loyalty?: { enabled?: unknown } } | null | undefined): boolean {
  return settings?.loyalty?.enabled === true;
}
