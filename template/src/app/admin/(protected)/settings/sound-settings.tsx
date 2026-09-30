"use client";

import { useState } from "react";
import { playAdminSound } from "@/lib/admin-audio";
import type { AdminSoundChoice, PublicAdminSound } from "@/lib/admin-sound";
import styles from "./settings-admin.module.css";
import { AdminIcon } from "../admin-icon";

export function SoundSettings({ initial }: { initial: PublicAdminSound }) {
  const [sound, setSound] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function request(method: "PATCH" | "POST" | "DELETE", body?: BodyInit) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/sound", {
        method, body, headers: method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить звук");
      setSound(data as PublicAdminSound);
      window.dispatchEvent(new CustomEvent("admin-sound-change", { detail: data as PublicAdminSound }));
      setMessage("Сохранено");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally { setBusy(false); }
  }

  function choose(choice: AdminSoundChoice) { void request("PATCH", JSON.stringify({ selected: choice })); }
  async function preview(choice: AdminSoundChoice) {
    try { await playAdminSound({ ...sound, selected: choice }); setMessage(""); }
    catch { setMessage("Браузер не смог воспроизвести звук"); }
  }

  return <section className={styles.card} aria-label="Звук уведомления">
    <div className={styles.soundHead}><div><h2>Звук уведомления</h2><p>Для новых заказов и бронирований</p></div><AdminIcon name="sound" size={20}/></div>
    {(["standard1", "standard2"] as const).map((choice, index) => <div className={styles.soundRow} key={choice}>
      <label><input type="radio" name="admin-sound" checked={sound.selected === choice} disabled={busy} onChange={() => choose(choice)}/> Звук {index + 1}</label>
      <button type="button" onClick={() => void preview(choice)} aria-label={`Прослушать звук ${index + 1}`}><AdminIcon name="play" size={16}/></button>
    </div>)}
    {sound.customName && <div className={styles.soundRow}>
      <label><input type="radio" name="admin-sound" checked={sound.selected === "custom"} disabled={busy} onChange={() => choose("custom")}/><span title={sound.customName}>{sound.customName}</span></label>
      <button type="button" onClick={() => void preview("custom")} aria-label="Прослушать свой звук"><AdminIcon name="play" size={16}/></button>
      <button type="button" onClick={() => void request("DELETE")} disabled={busy} aria-label="Удалить свой звук"><AdminIcon name="trash" size={17}/></button>
    </div>}
    <label className={styles.soundUpload}><AdminIcon name="upload" size={17}/> Загрузить свой звук
      <input type="file" accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg" disabled={busy} onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const form = new FormData(); form.set("file", file);
        void request("POST", form);
        event.target.value = "";
      }}/>
    </label>
    <button type="button" className={styles.soundTest} onClick={() => void preview(sound.selected)}>Проверить звук</button>
    <p className={styles.soundHint}>MP3, WAV или Ogg до 2 МБ. После удаления своего звука выбирается сигнал 1.</p>
    {message && <p role="status" className={styles.soundHint}>{message}</p>}
  </section>;
}
