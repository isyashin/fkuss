import Link from "next/link";
import { getSiteRestaurant, getSiteMenu, getSitePromos, getSitePages, getSiteTheme, getSiteSettings } from "@/lib/site";
import { isOpenAt, resolveSchedule } from "@/lib/hours";
import { MenuClient } from "@/components/menu/menu-client";
import { getPrisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [restaurant, menu, promos, pages, theme, settings] = await Promise.all([
    getSiteRestaurant(),
    getSiteMenu(),
    getSitePromos(),
    getSitePages(),
    getSiteTheme(),
    getSiteSettings(),
  ]);

  const schedule = resolveSchedule(restaurant);
  const now = new Date();
  const open = isOpenAt(
    schedule,
    now.toISOString().slice(0, 10),
    `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`,
  );

  const about = pages.pages.find((p) => p.slug === "about");
  const banquetsSettings = (settings as { banquets?: { enabled?: boolean; title?: string } }).banquets;
  let banquetsEnabled = banquetsSettings?.enabled === true;
  if (banquetsEnabled) {
    try {
      const prisma = getPrisma();
      banquetsEnabled = (await prisma.banquetHall.count()) > 0;
    } catch {
      // платформа/БД недоступна — считаем выключенным
      banquetsEnabled = false;
    }
  }

  const blocks = theme.homeBlocks;

  return (
    <>
      <main className="flex-1">
        {blocks.includes("hero") && (
          <section className="mx-auto max-w-5xl px-4 py-12 text-center">
            <h1 className="text-4xl md:text-5xl leading-tight">{restaurant.name}</h1>
            <p className="mt-3 text-muted text-lg capitalize">{restaurant.cuisine} кухня</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="#menu"
                className="min-h-12 px-8 inline-flex items-center justify-center rounded-[var(--radius)] bg-accent text-white font-medium text-lg"
              >
                Заказать с доставкой
              </a>
              {banquetsEnabled && (
                <Link
                  href="/banquets"
                  className="min-h-12 px-8 inline-flex items-center justify-center rounded-[var(--radius)] border border-foreground/20 font-medium text-lg"
                >
                  Банкеты
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Полное меню сразу после первого экрана */}
        <div id="menu" className="scroll-mt-16">
          <MenuClient
            menu={menu}
            delivery={settings.delivery}
            loyalty={settings.loyalty}
            whatsapp={settings.channels.whatsapp}
            isOpen={open}
          />
        </div>

        {blocks.includes("promos") && promos.promos.length > 0 && (
          <section className="mx-auto max-w-5xl px-4 py-8">
            <h2 className="text-2xl mb-4">Акции</h2>
            {promos.promos.map((promo) => (
              <div key={promo.id} className="bg-card rounded-[var(--radius)] p-5 shadow-sm">
                <h3 className="text-lg">{promo.title}</h3>
                <p className="text-muted mt-1">{promo.text}</p>
              </div>
            ))}
          </section>
        )}

        {blocks.includes("about") && about && (
          <section className="mx-auto max-w-5xl px-4 py-8">
            <h2 className="text-2xl mb-3">{about.title}</h2>
            <p className="text-muted leading-relaxed max-w-2xl">{about.body}</p>
          </section>
        )}

        {blocks.includes("contacts") && (
          <section className="mx-auto max-w-5xl px-4 py-8">
            <h2 className="text-2xl mb-4">Контакты</h2>
            <div className="grid md:grid-cols-2 gap-4 items-stretch">
              <div className="space-y-2 text-muted">
                <p>{restaurant.address}</p>
                {restaurant.workHours.map((wh) => (
                  <p key={wh.days}>{wh.days}: {wh.from}–{wh.to}</p>
                ))}
                <p>
                  <a href={`tel:${restaurant.phone}`} className="text-accent min-h-11 inline-flex items-center font-medium">
                    {restaurant.phone}
                  </a>
                </p>
                <div className="flex gap-2 pt-1">
                  {restaurant.socials.whatsapp && (
                    <a
                      href={`https://wa.me/${restaurant.socials.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener"
                      className="min-h-11 px-4 inline-flex items-center rounded-full border border-foreground/20 text-sm"
                    >
                      WhatsApp
                    </a>
                  )}
                  {restaurant.socials.telegram && (
                    <a
                      href={restaurant.socials.telegram}
                      target="_blank"
                      rel="noopener"
                      className="min-h-11 px-4 inline-flex items-center rounded-full border border-foreground/20 text-sm"
                    >
                      Telegram
                    </a>
                  )}
                </div>
              </div>
              {restaurant.address && (
                <div className="rounded-[var(--radius)] overflow-hidden border border-foreground/10 min-h-64">
                  <iframe
                    title="Карта"
                    src={`https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(restaurant.address)}`}
                    className="w-full h-full min-h-64"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-foreground/10 mt-8">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted">
          <p>{restaurant.name} · {restaurant.address}</p>
        </div>
      </footer>
    </>
  );
}
