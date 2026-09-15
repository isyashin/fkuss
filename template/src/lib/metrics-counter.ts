/** Счётчик просмотров страниц — в БД (переживает пересоздание контейнера). */
import { getPrisma } from "./db";

export async function incrementPageView(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const prisma = getPrisma();
  await prisma.metricsCounter.upsert({
    where: { date },
    create: { date, views: 1 },
    update: { views: { increment: 1 } },
  });
}

export async function getPageViews(date: string): Promise<number> {
  const prisma = getPrisma();
  const row = await prisma.metricsCounter.findUnique({ where: { date } });
  return row?.views ?? 0;
}

const BOT_UA = /bot|crawler|spider|preview|pingdom|lighthouse|headless/i;

/** Вызов из серверных компонентов витрины */
export async function trackPageView(userAgent: string | null): Promise<void> {
  if (userAgent && BOT_UA.test(userAgent)) return;
  try {
    await incrementPageView();
  } catch {
    // метрики не должны ронять страницу
  }
}
