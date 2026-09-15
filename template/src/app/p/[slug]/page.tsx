import { notFound } from "next/navigation";
import { getSitePages } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { pages } = await getSitePages();
  const page = pages.find((p) => p.slug === slug);
  if (!page) notFound();

  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-3xl mb-6">{page.title}</h1>
      <div className="text-muted leading-relaxed whitespace-pre-wrap">{page.body}</div>
    </main>
  );
}
