import { notFound } from "next/navigation";
import Image from "next/image";
import { getPrisma } from "@/lib/db";
import { getSiteSettings, contentAssetUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function BanquetsPage() {
  const settings = await getSiteSettings();
  const banquets = (settings as {
    banquets?: {
      enabled?: boolean;
      title?: string;
      description?: string;
      conditions?: string;
      pricesText?: string;
      contactPhone?: string;
      ctaText?: string;
      ctaUrl?: string;
    };
  }).banquets;

  if (!banquets?.enabled) notFound();

  const prisma = getPrisma();
  const halls = await prisma.banquetHall.findMany({ orderBy: { position: "asc" } });
  if (halls.length === 0) notFound();

  return (
    <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-3xl mb-2">{banquets.title || "Банкеты"}</h1>
      {banquets.description && <p className="text-muted max-w-2xl">{banquets.description}</p>}

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        {halls.map((hall) => {
          const images = hall.images.length > 0 ? hall.images : hall.image ? [hall.image] : [];
          return (
            <div key={hall.id} className="bg-card rounded-[var(--radius)] overflow-hidden shadow-sm">
              {images.length > 0 && (
                <div className="flex overflow-x-auto snap-x snap-mandatory">
                  {images.map((image, index) => (
                    <div key={index} className="relative aspect-video w-full shrink-0 snap-center bg-foreground/5">
                      <Image
                        src={contentAssetUrl(image)}
                        alt={`${hall.name} — фото ${index + 1}`}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="p-4">
                <h2 className="text-xl">{hall.name}</h2>
                {hall.capacity && <p className="text-accent text-sm mt-0.5">{hall.capacity}</p>}
                {hall.description && <p className="text-muted mt-1">{hall.description}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {banquets.conditions && (
        <section className="mt-8">
          <h2 className="text-2xl mb-2">Условия</h2>
          <p className="text-muted whitespace-pre-wrap max-w-2xl">{banquets.conditions}</p>
        </section>
      )}
      {banquets.pricesText && (
        <section className="mt-6">
          <h2 className="text-2xl mb-2">Цены</h2>
          <p className="text-muted whitespace-pre-wrap max-w-2xl">{banquets.pricesText}</p>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {banquets.contactPhone && (
          <a
            href={`tel:${banquets.contactPhone}`}
            className="min-h-12 px-8 inline-flex items-center justify-center rounded-[var(--radius)] bg-accent text-white font-medium"
          >
            Позвонить: {banquets.contactPhone}
          </a>
        )}
        {banquets.ctaText && banquets.ctaUrl && (
          <a
            href={banquets.ctaUrl}
            target="_blank"
            rel="noopener"
            className="min-h-12 px-8 inline-flex items-center justify-center rounded-[var(--radius)] border border-foreground/20 font-medium"
          >
            {banquets.ctaText}
          </a>
        )}
      </div>
    </main>
  );
}
