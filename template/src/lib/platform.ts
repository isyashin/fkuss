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

export async function fetchMyBilling(): Promise<SiteBilling | null> {
  if (!platformConfigured()) return null;
  try {
    const response = await fetch(`${process.env.PLATFORM_URL}/api/sites/me`, {
      headers: { "X-Site-Key": process.env.SITE_KEY! },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as SiteBilling;
  } catch {
    return null;
  }
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
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error ?? "Ошибка платформы" };
    return { confirmationUrl: data.confirmationUrl };
  } catch {
    return { error: "Платформа недоступна" };
  }
}
