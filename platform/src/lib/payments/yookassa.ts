import type { CreatePaymentInput, PaymentProvider, WebhookEvent } from "./types";

const API_URL = "https://api.yookassa.ru/v3/payments";

// Allowlist IP ЮKassa для webhook (документация ЮKassa)
const YOOKASSA_IPS = new Set([
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.156.11",
  "77.75.156.35",
  "77.75.154.128/25",
]);

export function buildYookassaPayload(input: CreatePaymentInput) {
  return {
    amount: { value: `${input.amount.toFixed(2)}`, currency: "RUB" },
    confirmation: { type: "redirect", return_url: input.returnUrl },
    description: input.description,
    capture: true,
    metadata: { orderId: input.orderId, orderNumber: String(input.orderNumber) },
  };
}

export function parseYookassaWebhook(body: unknown): WebhookEvent | null {
  const notification = body as {
    event?: string;
    object?: { id?: string; status?: string; metadata?: { orderId?: string } };
  };
  if (!notification?.object?.id || !notification.object.metadata?.orderId) return null;
  if (notification.event === "payment.succeeded") {
    return { orderId: notification.object.metadata.orderId, paymentId: notification.object.id, status: "paid" };
  }
  if (notification.event === "payment.canceled") {
    return { orderId: notification.object.metadata.orderId, paymentId: notification.object.id, status: "failed" };
  }
  return null;
}

function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const toInt = (v: string) => v.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(base) & mask);
}

export function createYookassaProvider(shopId: string, secret: string): PaymentProvider {
  const auth = Buffer.from(`${shopId}:${secret}`).toString("base64");

  return {
    name: "yookassa",

    async createPayment(input) {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
          "Idempotence-Key": input.orderId,
        },
        body: JSON.stringify(buildYookassaPayload(input)),
      });
      if (!response.ok) {
        throw new Error(`ЮKassa: HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        id: string;
        confirmation?: { confirmation_url?: string };
      };
      if (!data.confirmation?.confirmation_url) {
        throw new Error("ЮKassa: нет confirmation_url");
      }
      return { paymentId: data.id, confirmationUrl: data.confirmation.confirmation_url };
    },

    parseWebhook: parseYookassaWebhook,

    verifyWebhook(request) {
      // В тестах/sandbox разрешаем ослабить проверку явным флагом
      if (process.env.YOOKASSA_WEBHOOK_INSECURE === "1") return true;
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "";
      for (const cidr of YOOKASSA_IPS) {
        if (ipInCidr(ip, cidr)) return true;
      }
      return false;
    },
  };
}
