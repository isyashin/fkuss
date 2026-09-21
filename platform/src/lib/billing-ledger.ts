type PaymentRow = {
  id: string;
  siteId: string;
  amount: number;
};

type BillingTransaction = {
  payment: {
    findFirst(args: { where: { invoiceId: number } }): Promise<PaymentRow | null>;
    updateMany(args: {
      where: { id: string; status: string };
      data: { status: string; providerPaymentId: string };
    }): Promise<{ count: number }>;
  };
  invoice: {
    update(args: {
      where: { id: number };
      data: { status: string; paidAt: Date };
    }): Promise<unknown>;
  };
  balanceTransaction: {
    create(args: {
      data: {
        siteId: string;
        type: string;
        amount: number;
        dedupeKey: string;
        comment: string;
      };
    }): Promise<unknown>;
  };
  site: {
    updateMany(args: {
      where: { slug: string; state: { in: string[] } };
      data: { state: string; stateChangedAt: Date };
    }): Promise<unknown>;
  };
};

type BillingDatabase = {
  $transaction(callback: (tx: BillingTransaction) => Promise<boolean>): Promise<boolean>;
};

type NotificationDatabase = {
  balanceTransaction: {
    create(args: {
      data: {
        siteId: string;
        type: string;
        amount: number;
        comment: string;
        dedupeKey: string;
      };
    }): Promise<unknown>;
  };
};

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export function lowBalanceNotificationKey(
  siteId: string,
  topupCycleId: string,
  threshold: number,
): string {
  return `notify:${siteId}:${topupCycleId}:${threshold}`;
}

/** Конкурентный claim уведомления через уникальный ledger key. */
export async function claimLowBalanceNotification(
  prisma: NotificationDatabase,
  siteId: string,
  topupCycleId: string,
  threshold: number,
): Promise<boolean> {
  try {
    await prisma.balanceTransaction.create({
      data: {
        siteId,
        type: "adjustment",
        amount: 0,
        comment: `notify:${threshold}`,
        dedupeKey: lowBalanceNotificationKey(siteId, topupCycleId, threshold),
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
}

/**
 * Применяет успешное пополнение целиком в одной транзакции. Переход
 * pending → paid служит конкурентным claim: повторный webhook ничего не делает.
 */
export function applyPaidTopup(
  prisma: BillingDatabase,
  invoiceId: number,
  providerPaymentId: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { invoiceId } });
    if (!payment) return false;

    const marked = await tx.payment.updateMany({
      where: { id: payment.id, status: "pending" },
      data: { status: "paid", providerPaymentId },
    });
    if (marked.count === 0) return false;

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt: new Date() },
    });
    await tx.balanceTransaction.create({
      data: {
        siteId: payment.siteId,
        type: "topup",
        amount: payment.amount,
        dedupeKey: `topup:${payment.id}`,
        comment: `Оплата счёта №${invoiceId}`,
      },
    });
    await tx.site.updateMany({
      where: { slug: payment.siteId, state: { in: ["grace", "suspended"] } },
      data: { state: "active", stateChangedAt: new Date() },
    });
    return true;
  });
}
