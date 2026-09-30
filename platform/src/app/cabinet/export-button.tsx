"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  if (requested) {
    return <p className="pf-note" role="status">Экспорт запрошен — архив скоро появится в кабинете.</p>;
  }

  return (
    <button type="button" className="pf-btn pf-btnOutline" disabled={pending}
      onClick={() => startTransition(async () => { await requestExportAction(slug); router.refresh(); })}>
      {pending ? "Запрашиваю…" : label}
    </button>
  );
}
