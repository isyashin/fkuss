"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestSiteExport } from "./actions";

export function ExportSiteButton({ slug, requested, readyPath }: { slug: string; requested: boolean; readyPath?: string | null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (readyPath) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="pf-badge pf-badgeGreen">Архив готов: {readyPath}</span>
        <button type="button" className="pf-btn pf-btnOutline" disabled={pending || requested}
          onClick={() => startTransition(async () => { await requestSiteExport(slug); router.refresh(); })}>
          {pending ? "Запрашиваю…" : "Подготовить новый архив"}
        </button>
      </div>
    );
  }
  if (requested) {
    return <p className="pf-note">Экспорт запрошен — архив появится здесь после обработки (cron на хосте, ~5 мин).</p>;
  }
  return (
    <button type="button" className="pf-btn pf-btnOutline" disabled={pending}
      onClick={() => startTransition(async () => { await requestSiteExport(slug); router.refresh(); })}>
      {pending ? "Запрашиваю…" : "Запросить экспорт сайта"}
    </button>
  );
}
