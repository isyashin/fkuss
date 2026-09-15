"use client";

import { useTransition } from "react";
import { requestExportAction } from "./export-action";

export function ExportButton({ slug, requested }: { slug: string; requested: boolean }) {
  const [pending, startTransition] = useTransition();

  if (requested) {
    return <p className="text-sm text-zinc-500">Экспорт запрошен — ссылка придёт на email.</p>;
  }

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => requestExportAction(slug))}
      className="min-h-11 px-5 rounded-full border border-zinc-300 text-sm font-medium disabled:opacity-50"
    >
      {pending ? "Запрашиваю…" : "Запросить экспорт"}
    </button>
  );
}
