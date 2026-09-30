"use client";

import { useState, useTransition } from "react";
import { savePage } from "../content-actions";
import type { Page } from "@/generated/prisma/client";
import styles from "./pages-admin.module.css";

export function PagesAdmin({ pages }: { pages: Page[] }) {
  const [selected, setSelected] = useState<Page | null>(pages[0] ?? null);
  const [title, setTitle] = useState(pages[0]?.title ?? "");
  const [body, setBody] = useState(pages[0]?.body ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);

  function select(page: Page) {
    setSelected(page);
    setTitle(page.title);
    setBody(page.body);
    setSaved(false);
    setPreview(false);
  }

  return (
    <div className={styles.editor}>
      <div className={styles.tabs} role="tablist" aria-label="Страница сайта">
        {pages.map((page) => (
          <button
            key={page.slug}
            type="button"
            role="tab"
            aria-selected={selected?.slug === page.slug}
            onClick={() => select(page)}
            className={selected?.slug === page.slug ? styles.activeTab : styles.tab}
          >
            {page.title}
          </button>
        ))}
      </div>

      {selected && (
        <div className={styles.fields}>
          <label>Заголовок<input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
          /></label>
          <label>Текст<textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 rounded-[var(--radius)] bg-card border border-foreground/15"
          /></label>
          <div className={styles.actions}>
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await savePage(selected.slug, title, body);
                  setSaved(true);
                })
              }
              className={styles.save}
            >
              Сохранить
            </button>
            <button type="button" onClick={() => setPreview((value) => !value)} className={styles.outline}>
              {preview ? "Скрыть предпросмотр" : "Предпросмотр"}
            </button>
            {saved && <span className="text-green-600 text-sm">Сохранено ✓</span>}
            <a href={`/p/${selected.slug}`} target="_blank" className={styles.textLink}>
              Открыть страницу →
            </a>
          </div>
          {preview && <div className={styles.preview}><h3>{title}</h3><p>{body}</p></div>}
        </div>
      )}
    </div>
  );
}
