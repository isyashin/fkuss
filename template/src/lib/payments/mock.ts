import type { PaymentProvider } from "./types";

/** Тестовый провайдер: «оплата» сразу успешна, webhook не нужен */
export const mockProvider: PaymentProvider = {
  name: "mock",
  async createPayment(input) {
    const next = encodeURIComponent(input.returnUrl);
    return {
      paymentId: `mock_${input.orderId}`,
      confirmationUrl: `/payment/mock?order=${input.orderNumber}&sum=${input.amount}&next=${next}`,
    };
  },
  parseWebhook() {
    return null;
  },
  verifyWebhook() {
    return true;
  },
};
