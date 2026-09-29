/** Доступ к биллингу платформы по site key (серверная сторона). */

export interface SiteBilling {
  name: string;
  slug: string;
  state: string;
  balanceKopecks: number;
  daysLeft: number;
  tariff: { name: string; monthlyPrice: number } | null;
  invoices: { id: number; amountKopecks: number; status: string; createdAt: string }[];
  metrics: {
    date: string;
    ordersCount: number;
    ordersSumKopecks: number;
    bookingsCount: number;
    pageViews: number;
  }[];
}

export function platformConfigured(): boolean {
  return Boolean(process.env.PLATFORM_URL && process.env.SITE_KEY);
}

const BILLING_CACHE_MS = 60_000;
let billingCache: { at: number; data: SiteBilling | null } | null = null;

/**
 * Биллинг платформы с таймаутом и коротким кэшем: страницы админки не должны
 * ждать недоступную платформу — лимит 3 с + данные не старше минуты.
 */
export async function fetchMyBilling(): Promise<SiteBilling | null> {
  if (!platformConfigured()) return null;
  if (billingCache && Date.now() - billingCache.at < BILLING_CACHE_MS) return billingCache.data;
  let data: SiteBilling | null = null;
  try {
    const response = await fetch(`${process.env.PLATFORM_URL}/api/sites/me`, {
      headers: { "X-Site-Key": process.env.SITE_KEY! },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) data = (await response.json()) as SiteBilling;
  } catch {
    data = null;
  }
  billingCache = { at: Date.now(), data };
  return data;
}

function invalidateBillingCache(): void {
  billingCache = null;
}

export async function requestTopup(
  amountRub: number,
  returnUrl?: string,
): Promise<{ confirmationUrl?: string; error?: string }> {
  if (!platformConfigured()) return { error: "Платформа не подключена" };
  try {
    const response = await fetch(`${process.env.PLATFORM_URL}/api/billing/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Key": process.env.SITE_KEY! },
      body: JSON.stringify({ amountRub, returnUrl }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error ?? "Ошибка платформы" };
    invalidateBillingCache();
    return { confirmationUrl: data.confirmationUrl };
  } catch {
    return { error: "Платформа недоступна" };
  }
}
