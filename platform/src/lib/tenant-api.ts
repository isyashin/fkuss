/** Клиентские вызовы сайта-тенанта из платформы (по внутренней docker-сети). */
import { getPrisma } from "./db";

const TIMEOUT_MS = 3000;

async function tenantBase(slug: string): Promise<{ base: string; siteKey: string } | null> {
  const site = await getPrisma().site.findUnique({ where: { slug }, select: { siteKey: true } });
  if (!site) return null;
  return { base: `http://${slug}-app-1:3000`, siteKey: site.siteKey };
}

export async function getTenantOwnerPin(slug: string): Promise<string | null> {
  const t = await tenantBase(slug);
  if (!t) return null;
  try {
    const response = await fetch(`${t.base}/api/sites/owner-pin`, {
      headers: { "X-Site-Key": t.siteKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.pin === "string" ? data.pin : null;
  } catch {
    return null;
  }
}

export async function setTenantOwnerPin(slug: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  const t = await tenantBase(slug);
  if (!t) return { ok: false, error: "Сайт не найден" };
  try {
    const response = await fetch(`${t.base}/api/sites/owner-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Key": t.siteKey },
      body: JSON.stringify({ pin }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, error: "Сайт отклонил смену PIN" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Сайт недоступен по сети" };
  }
}
