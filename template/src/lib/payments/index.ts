import { mockProvider } from "./mock";
import { createYookassaProvider } from "./yookassa";
import type { PaymentProvider } from "./types";

export function getPaymentProvider(provider: string): PaymentProvider | null {
  switch (provider) {
    case "mock":
      return mockProvider;
    case "yookassa": {
      const shopId = process.env.YOOKASSA_SHOP_ID;
      const secret = process.env.YOOKASSA_SECRET;
      if (!shopId || !secret) {
        throw new Error("ЮKassa: не заданы YOOKASSA_SHOP_ID / YOOKASSA_SECRET");
      }
      return createYookassaProvider(shopId, secret);
    }
    default:
      return null; // «none» — оплата при получении
  }
}
