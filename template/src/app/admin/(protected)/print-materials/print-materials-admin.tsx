"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import QRCode from "qrcode";
import {
  PRINT_MATERIAL_SPECS,
  buildPrintMaterialSvg,
  buildTrackedQrUrl,
  printFileStem,
  printMaterialDesignSchema,
  type PrintBrand,
  type PrintExportFormat,
  type PrintMaterialDesign,
  type PrintMaterialKind,
  type PrintMaterialsSettings,
  type PrintMaterialStyle,
} from "@/lib/print-materials";
import { savePrintMaterial } from "./actions";
import styles from "./print-materials-admin.module.css";

const MATERIALS: { kind: PrintMaterialKind; label: string; hint: string }[] = [
  { kind: "card", label: "Визитка", hint: "Вкладыш 90 × 50 мм" },
  { kind: "magnet", label: "Магнит", hint: "Квадрат 70 × 70 мм" },
];

const STYLES: { value: PrintMaterialStyle; label: string }[] = [
  { value: "accent", label: "Акцентный" },
  { value: "minimal", label: "Минималистичный" },
  { value: "contrast", label: "Контрастный" },
];

const EXPORTS: { format: PrintExportFormat; label: string; hint: string }[] = [
  { format: "pdf", label: "Скачать PDF", hint: "для типографии" },
  { format: "png", label: "Скачать PNG", hint: "300 dpi" },
  { format: "svg", label: "Скачать SVG", hint: "векторный макет" },
];

export function PrintMaterialsAdmin({
  initialSettings,
  brand,
  restaurantSlug,
}: {
  initialSettings: PrintMaterialsSettings;
  brand: PrintBrand;
  restaurantSlug: string;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [kind, setKind] = useState<PrintMaterialKind>("card");
  const [qrPreview, setQrPreview] = useState({ url: "", data: "" });
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState<PrintExportFormat | null>(null);
  const [pending, startTransition] = useTransition();
  const design = settings[kind];
  const spec = PRINT_MATERIAL_SPECS[kind];
  const validation = useMemo(() => printMaterialDesignSchema.safeParse(design), [design]);
  const trackedUrl = useMemo(() => {
    if (!validation.success) return "";
    return buildTrackedQrUrl(validation.data);
  }, [validation]);

  useEffect(() => {
    if (!trackedUrl) return;
    let active = true;
    void QRCode.toDataURL(trackedUrl, {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 900,
      color: { dark: "#111111", light: "#ffffff" },
    }).then((data) => {
      if (active) setQrPreview({ url: trackedUrl, data });
    });
    return () => {
      active = false;
    };
  }, [trackedUrl]);

  const previewSvg = useMemo(() => {
    if (!validation.success || qrPreview.url !== trackedUrl || !qrPreview.data) return "";
    return buildPrintMaterialSvg({
      design: validation.data,
      brand,
      qrDataUrl: qrPreview.data,
      showGuides: true,
    });
  }, [brand, qrPreview, trackedUrl, validation]);

  function update(patch: Partial<PrintMaterialDesign>) {
    setMessage("");
    setSettings((current) => ({
      ...current,
      [kind]: { ...current[kind], ...patch, kind },
    }));
  }

  function save() {
    if (!validation.success) {
      setMessage(validation.error.issues[0]?.message ?? "Проверьте поля");
      return;
    }
    startTransition(async () => {
      try {
        await savePrintMaterial(validation.data);
        setMessage("Настройки сохранены");
      } catch {
        setMessage("Не удалось сохранить настройки");
      }
    });
  }

  async function download(format: PrintExportFormat) {
    if (!validation.success) {
      setMessage(validation.error.issues[0]?.message ?? "Проверьте поля");
      return;
    }
    setExporting(format);
    setMessage("");
    try {
      const response = await fetch("/api/admin/print-materials/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design: validation.data, format }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? "Не удалось сформировать файл");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const responseName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
      const fileName = responseName ?? `${printFileStem(restaurantSlug, validation.data)}.${format}`;
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
      setMessage(`${fileName} готов`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сформировать файл");
    } finally {
      setExporting(null);
    }
  }

  const inputClass = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";
  const textareaClass = "mt-1 w-full px-3 py-2 rounded-[var(--radius)] bg-card border border-foreground/15";

  return (
    <div className={styles.editor}>
      <div className={styles.tabs} role="tablist" aria-label="Тип макета">
        {MATERIALS.map((material) => (
          <button
            key={material.kind}
            type="button"
            role="tab"
            aria-selected={kind === material.kind}
            onClick={() => {
              setKind(material.kind);
              setMessage("");
            }}
            className={kind === material.kind ? styles.activeTab : styles.tab}
          >
            {material.label} · {material.hint}
          </button>
        ))}
      </div>

      <div className="grid gap-6 items-start">
        <div className="space-y-5 min-w-0">
          <section className={styles.section}>
            <div>
              <h2 className="text-xl">Дизайн</h2>
              <p className="text-sm text-muted mt-1">Все поля относятся только к выбранному макету.</p>
            </div>

            <div className={styles.fields}>
            <label className="block"><span className="text-sm text-muted">Стиль</span>
              <select value={design.style} onChange={(event) => update({ style: event.target.value as PrintMaterialStyle })} className={inputClass}>
                {STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-muted">Заголовок</span>
              <input
                value={design.headline}
                maxLength={72}
                onChange={(event) => update({ headline: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm text-muted">Пояснение</span>
              <textarea
                rows={2}
                value={design.subheadline}
                maxLength={160}
                onChange={(event) => update({ subheadline: event.target.value })}
                className={textareaClass}
              />
            </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <ColorField label="Фон" value={design.backgroundColor} onChange={(backgroundColor) => update({ backgroundColor })} />
              <ColorField label="Текст" value={design.textColor} onChange={(textColor) => update({ textColor })} />
              <ColorField label="Акцент" value={design.accentColor} onChange={(accentColor) => update({ accentColor })} />
            </div>
            <label className="block">
              <span className="text-sm text-muted">Фраза рядом с QR-кодом</span>
              <input
                value={design.offer}
                maxLength={90}
                onChange={(event) => update({ offer: event.target.value })}
                className={inputClass}
              />
            </label>

            <div className="grid sm:grid-cols-3 gap-2">
              <CheckField checked={design.showLogo} onChange={(showLogo) => update({ showLogo })} label="Логотип" />
              <CheckField checked={design.showPhone} onChange={(showPhone) => update({ showPhone })} label="Телефон" />
              {kind === "card" && (
                <CheckField checked={design.showAddress} onChange={(showAddress) => update({ showAddress })} label="Адрес" />
              )}
            </div>
          </section>

          <section className={styles.section}>
            <div>
              <h2 className="text-xl">QR-ссылка</h2>
              <p className="text-sm text-muted mt-1">Метки помогают отличить заказы с визитки от заказов с магнита.</p>
            </div>
            <div className={styles.fields}>
            <label className="block">
              <span className="text-sm text-muted">Адрес сайта (из настроек домена)</span>
              <input
                type="url"
                value={design.qrUrl}
                readOnly
                aria-readonly="true"
                className={`${inputClass} opacity-75`}
              />
            </label>
            <label className="block">
              <span className="text-sm text-muted">Название кампании</span>
              <input
                value={design.campaign}
                maxLength={64}
                onChange={(event) => update({ campaign: event.target.value })}
                className={inputClass}
                placeholder="repeat-order"
              />
            </label>
            </div>
            {trackedUrl && (
              <div className="rounded-[var(--radius)] bg-foreground/5 p-3 text-xs break-all">
                <p className="text-muted mb-1">В QR-коде:</p>
                <a href={trackedUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                  {trackedUrl}
                </a>
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div>
              <h2 className="text-xl">Сохранение и экспорт</h2>
              <p className="text-sm text-muted mt-1">
                Макет включает вылеты по 3 мм. PDF и PNG создаются в RGB; перед большим тиражом согласуйте цветовой профиль с типографией.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || !validation.success}
                onClick={save}
                className={styles.save}
              >
                {pending ? "Сохраняем…" : "Сохранить макет"}
              </button>
              {EXPORTS.map((item) => (
                <button
                  key={item.format}
                  type="button"
                  disabled={exporting !== null || !validation.success}
                  onClick={() => void download(item.format)}
                  className={styles.outline}
                >
                  {exporting === item.format ? "Готовим…" : item.label}
                  <span className="sr-only">, {item.hint}</span>
                </button>
              ))}
            </div>
            {!validation.success && (
              <p className="text-sm text-red-600">{validation.error.issues[0]?.message ?? "Проверьте поля"}</p>
            )}
            {message && <p className="text-sm" aria-live="polite">{message}</p>}
          </section>
        </div>

        <aside className="space-y-3 min-w-0">
          <div className="bg-card rounded-[var(--radius)] p-4">
            <div className="flex flex-wrap justify-between gap-2 mb-3 text-sm">
              <p className="font-medium">Предпросмотр</p>
              <p className="text-muted">
                {spec.trimWidthMm} × {spec.trimHeightMm} мм · файл {spec.pageWidthMm} × {spec.pageHeightMm} мм
              </p>
            </div>
            <div className="rounded-lg bg-foreground/5 p-3 overflow-hidden">
              {previewSvg ? (
                <div
                  role="img"
                  aria-label={`Предпросмотр: ${spec.label}`}
                  className="w-full shadow-xl [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              ) : (
                <div className="min-h-64 flex items-center justify-center text-sm text-muted">Проверьте поля макета</div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span><i className="inline-block w-3 border-t border-dashed border-sky-500 mr-1 align-middle" />линия реза</span>
              <span><i className="inline-block w-3 border-t border-dashed border-pink-500 mr-1 align-middle" />безопасная зона</span>
            </div>
          </div>
          <div className="rounded-[var(--radius)] border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">Перед тиражом</p>
            <p className="mt-1">
              Распечатайте один экземпляр, проверьте QR-код обычной камерой и попросите типографию подтвердить размер, вылеты и цветовой профиль.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <span className="mt-1 min-h-11 px-2 rounded-[var(--radius)] border border-foreground/15 flex items-center gap-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="w-10 h-8" />
        <span className="text-xs font-mono uppercase">{value}</span>
      </span>
    </label>
  );
}

function CheckField({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15 flex items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="w-5 h-5 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}
