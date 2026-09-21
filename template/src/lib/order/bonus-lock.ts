type BonusLockTransaction = {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  bonusTransaction: {
    aggregate(args: {
      where: { customerId: string };
      _sum: { amount: true };
    }): Promise<{ _sum: { amount: number | null } }>;
  };
};

/**
 * Сериализует списания бонусов одного гостя в PostgreSQL и только после
 * блокировки читает актуальный баланс. Блокировка живёт до конца транзакции.
 */
export async function lockAndCheckBonusBalance(
  tx: BonusLockTransaction,
  customerId: string,
  requested: number,
): Promise<boolean> {
  const lockKey = `bonus:${customerId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  const aggregate = await tx.bonusTransaction.aggregate({
    where: { customerId },
    _sum: { amount: true },
  });
  return (aggregate._sum.amount ?? 0) >= requested;
}
