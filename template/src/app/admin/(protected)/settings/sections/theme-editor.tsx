"use client";

import { useState, useTransition } from "react";
import { saveBackground, saveTheme } from "../actions";
import { contentAssetUrl } from "@/lib/assets";
import type { ThemeConfig } from "@/lib/content";
import rd from "../../admin-redesign.module.css";
import styles from "../settings-redesign.module.css";

const PRESETS = [
  { id: "warm", name: "Тёплый (трактир)" },
  { id: "minimal", name: "Минимальный" },
  { id: "elegant", name: "Тёмный (fine dining)" },
];

type Bg = { enabled: boolean; image: string; position: "center" | "top" | "bottom"; dimPercent: number; disableOnMobile: boolean };

/** Оформление сайта: пресет, фирменный цвет, фон. Секция «Сайт → Оформление». */
export function ThemeEditor({ theme }: { theme: ThemeConfig }) {
  const [preset, setPreset] = useState(theme.preset);
  const [accent, setAccent] = useState(theme.accent);
  const initialBg: Bg = {
    enabled: theme.background?.enabled ?? false,
    image: theme.background?.image ?? "",
    position: theme.background?.position ?? "center",
    dimPercent: theme.background?.dimPercent ?? 40,
    disableOnMobile: theme.background?.disableOnMobile ?? true,
  };
  const [bg, setBg] = useState<Bg>(initialBg);
  const [saved, setSaved] = useState({ preset: theme.preset, accent: theme.accent, bg: initialBg });
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const dirty = preset !== saved.preset || accent !== saved.accent || JSON.stringify(bg) !== JSON.stringify(saved.bg);

  function save() {
    startTransition(async () => {
      setStatus(null);
      try {
        await saveTheme({ preset, accent });
        await saveBackground(bg);
        setSaved({ preset, accent, bg });
        setStatus({ text: "Сохранено", error: false });
      } catch (cause) {
        setStatus({ text: cause instanceof Error ? cause.message : "Не удалось сохранить", error: true });
      }
    });
  }

  return <section className={styles.editorCard} aria-label="Оформление сайта">
    <h2 className={styles.editorTitle}>Оформление</h2>
    <p className={styles.editorHint}>Эти параметры относятся к сайту ресторана. Тема самой панели переключается в меню профиля.</p>
    <div className={styles.formGrid}>
      <label className={rd.field}><span>Пресет</span>
        <select className={rd.input} value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)}>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className={rd.field}><span>Фирменный цвет</span>
        <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} style={{ width: 64, height: 44 }} />
      </label>
    </div>
    <div className={styles.toggleList}>
      <label className={styles.toggleRow}><input type="checkbox" checked={bg.enabled} onChange={(e) => setBg({ ...bg, enabled: e.target.checked })} />Фон включён</label>
    </div>
    {/* F16: поля фона недоступны вместе с подписью, пока фон выключен */}
    <fieldset disabled={!bg.enabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 16 }}>
      <div className={styles.formGrid}>
        <label className={rd.field}><span>Положение фона</span>
          <select className={rd.input} value={bg.position} onChange={(e) => setBg({ ...bg, position: e.target.value as Bg["position"] })}>
            <option value="center">По центру</option><option value="top">Сверху</option><option value="bottom">Снизу</option>
          </select>
        </label>
        <label className={rd.field}><span>Затемнение: {bg.dimPercent}%</span>
          <input type="range" min={0} max={100} value={bg.dimPercent} onChange={(e) => setBg({ ...bg, dimPercent: Number(e.target.value) })} style={{ marginTop: 12 }} />
        </label>
      </div>
      <label className={styles.toggleRow}><input type="checkbox" checked={bg.disableOnMobile} onChange={(e) => setBg({ ...bg, disableOnMobile: e.target.checked })} />Отключить фон на мобильных</label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label className={rd.btn}>{bg.image ? "Заменить изображение" : "Загрузить изображение"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.append("file", file);
            fd.append("section", "background");
            fd.append("name", `bg-${Date.now().toString(36)}`);
            const response = await fetch("/api/admin/upload", { method: "POST", body: fd });
            const data = await response.json();
            if (response.ok) setBg({ ...bg, image: data.path });
            else setStatus({ text: data.error ?? "Ошибка загрузки", error: true });
          }} />
        </label>
        {bg.image && <button type="button" className={`${rd.btn} ${rd.btnDanger}`} onClick={() => setBg({ ...bg, image: "" })}>Удалить</button>}
        {bg.image && <img src={contentAssetUrl(bg.image)} alt="Фон — превью" style={{ width: 180, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid var(--rd-line)" }} />}
      </div>
    </fieldset>
    {dirty && <div className={styles.saveBar}>
      <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending} onClick={save}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      {status && <span role={status.error ? "alert" : "status"} className={`${styles.saveStatus}${status.error ? ` ${styles.error}` : ""}`} style={status.error ? {} : { color: "var(--rd-success)" }}>{status.text}</span>}
    </div>}
    {status && !dirty && <p className={rd.saved} role="status">{status.text}</p>}
  </section>;
}
