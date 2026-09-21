"use client";

import { useTransition } from "react";
import { requestExportAction } from "./export-action";

export function ExportButton({
  slug,
  requested,
  label = "Запросить экспорт",
}: {
  slug: string;
  requested: boolean;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();

  if (requested) {
    return <p className="text-sm text-zinc-500">Экспорт запрошен — архив скоро появится в кабинете.</p>;
  }

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => requestExportAction(slug))}
      className="min-h-11 px-5 rounded-full border border-zinc-300 text-sm font-medium disabled:opacity-50"
    >
      {pending ? "Запрашиваю…" : label}
    </button>
  );
}
