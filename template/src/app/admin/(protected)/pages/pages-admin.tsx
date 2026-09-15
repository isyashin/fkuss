"use client";

import { useState, useTransition } from "react";
import { savePage } from "../content-actions";
import type { Page } from "@/generated/prisma/client";

export function PagesAdmin({ pages }: { pages: Page[] }) {
  const [selected, setSelected] = useState<Page | null>(pages[0] ?? null);
  const [title, setTitle] = useState(pages[0]?.title ?? "");
  const [body, setBody] = useState(pages[0]?.body ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function select(page: Page) {
    setSelected(page);
    setTitle(page.title);
    setBody(page.body);
    setSaved(false);
  }

  return (
    <div className="grid md:grid-cols-[200px_1fr] gap-4 max-w-4xl">
      <div className="space-y-1">
        {pages.map((page) => (
          <button
            key={page.slug}
            onClick={() => select(page)}
            className={`w-full text-left min-h-11 px-3 rounded-[var(--radius)] ${
              selected?.slug === page.slug ? "bg-accent text-white" : "bg-card"
            }`}
          >
            {page.title}
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 rounded-[var(--radius)] bg-card border border-foreground/15"
          />
          <div className="flex items-center gap-3">
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await savePage(selected.slug, title, body);
                  setSaved(true);
                })
              }
              className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50"
            >
              Сохранить
            </button>
            {saved && <span className="text-green-600 text-sm">Сохранено ✓</span>}
            <a href={`/p/${selected.slug}`} target="_blank" className="text-accent text-sm min-h-11 inline-flex items-center">
              Открыть страницу →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
