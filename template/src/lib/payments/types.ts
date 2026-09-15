/** Абстракция платёжного провайдера. Детали: docs/PAYMENTS.md */

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: number;
  amount: number; // рубли, целое
  description: string;
  returnUrl: string;
}

export interface CreatedPayment {
  paymentId: string;
  confirmationUrl: string;
}

export interface WebhookEvent {
  orderId: string;
  paymentId: string;
  status: "paid" | "failed";
}

export interface PaymentProvider {
  name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Парсит тело webhook; null — событие не про заказ/не наше */
  parseWebhook(body: unknown): WebhookEvent | null;
  /** Проверка подлинности webhook (IP/подпись). В dev может быть ослаблена. */
  verifyWebhook(request: Request): boolean;
}
