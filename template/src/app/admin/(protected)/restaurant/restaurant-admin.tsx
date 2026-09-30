"use client";

import { useState, useTransition } from "react";
import { saveRestaurant, afterLogoUpload } from "./actions";
import type { WeeklySchedule, DaySchedule, DayException } from "@/lib/hours";
import { contentAssetUrl } from "@/lib/assets";
import styles from "./restaurant-admin.module.css";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Пн" },
  { key: "tue", label: "Вт" },
  { key: "wed", label: "Ср" },
  { key: "thu", label: "Чт" },
  { key: "fri", label: "Пт" },
  { key: "sat", label: "Сб" },
  { key: "sun", label: "Вс" },
];

const DEFAULT_DAY: DaySchedule = { open: true, from: "12:00", to: "23:00" };

interface FormState {
  name: string;
  phone: string;
  email: string;
  address: string;
  socials: { telegram: string; max: string; whatsapp: string; vk: string };
  schedule: WeeklySchedule;
}

export function RestaurantAdmin({ initial, logoUrl = "" }: { initial: FormState; logoUrl?: string }) {
  const [form, setForm] = useState<FormState>(initial);
  const [currentLogo, setCurrentLogo] = useState(logoUrl);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  function setDay(key: string, patch: Partial<DaySchedule>) {
    const days = { ...form.schedule.days } as Record<string, DaySchedule>;
    days[key] = { ...(days[key] ?? DEFAULT_DAY), ...patch };
    setForm({ ...form, schedule: { ...form.schedule, days } });
  }

  function addException() {
    const exceptions = [...form.schedule.exceptions, { date: "", open: false, from: "12:00", to: "23:00" } as DayException];
    setForm({ ...form, schedule: { ...form.schedule, exceptions } });
  }

  function setException(index: number, patch: Partial<DayException>) {
    const exceptions = form.schedule.exceptions.map((e, i) => (i === index ? { ...e, ...patch } : e));
    setForm({ ...form, schedule: { ...form.schedule, exceptions } });
  }

  return (
    <div className={styles.form}>
      <section className={styles.section}>
        <div className={styles.fields}>
        <label className="block">
          <span className="text-sm text-muted">Название</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </label>
          <label className="block">
            <span className="text-sm text-muted">Телефон</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Email</span>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </label>
        <label className="block">
          <span className="text-sm text-muted">Адрес</span>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm text-muted">WhatsApp (номер)</span>
          <input value={form.socials.whatsapp} onChange={(e) => setForm({ ...form, socials: { ...form.socials, whatsapp: e.target.value } })} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Telegram (ссылка)</span>
          <input value={form.socials.telegram} onChange={(e) => setForm({ ...form, socials: { ...form.socials, telegram: e.target.value } })} className={inputCls} />
        </label>
        </div>
        <div className={styles.logoEdit}>
          {currentLogo ? <img src={currentLogo} alt="Логотип ресторана" /> : <div className={styles.logoPlaceholder} aria-label="Логотип пока не загружен">Логотип</div>}
          <div><p>Логотип сайта</p>
          <label className={styles.outlineUpload}>
            Заменить логотип
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append("file", file);
                fd.append("section", "logo");
                fd.append("name", "logo");
                const response = await fetch("/api/admin/upload", { method: "POST", body: fd });
                if (response.ok) {
                  const data = await response.json() as { path: string };
                  setCurrentLogo(contentAssetUrl(data.path));
                  startTransition(() => afterLogoUpload());
                }
              }}
            />
          </label>
          </div>
        </div>
      </section>

      <section>
        <h3 className={styles.subhead}>Часы работы</h3>
        <div className={styles.hoursList}>
          {DAYS.map(({ key, label }) => {
            const day = (form.schedule.days as Record<string, DaySchedule>)[key] ?? DEFAULT_DAY;
            return (
              <div key={key} className={styles.hoursRow}>
                <strong>{label}</strong>
                <label className={styles.dayToggle}>
                  <input
                    type="checkbox"
                    checked={day.open}
                    onChange={(e) => setDay(key, { open: e.target.checked })}
                    className="w-5 h-5 accent-[var(--accent)]"
                  />
                  <span>{day.open ? "Открыто" : "Выходной"}</span>
                </label>
                    <input
                      type="time"
                      value={day.from}
                      disabled={!day.open}
                      aria-label={`С ${label}`}
                      onChange={(e) => setDay(key, { from: e.target.value })}
                      className={styles.timeInput}
                    />
                    <span className={styles.timeDash}>–</span>
                    <input
                      type="time"
                      value={day.to}
                      disabled={!day.open}
                      aria-label={`До ${label}`}
                      onChange={(e) => setDay(key, { to: e.target.value })}
                      className={styles.timeInput}
                    />
              </div>
            );
          })}
        </div>
        <p className="text-muted text-xs mt-2">Если «до» меньше «с» — ресторан работает через полночь.</p>
      </section>

      <section>
        <h3 className={styles.subhead}>Особые дни</h3>
        <div className="space-y-2">
          {form.schedule.exceptions.map((ex, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 bg-card rounded-[var(--radius)] p-2">
              <input
                type="date"
                value={ex.date}
                onChange={(e) => setException(i, { date: e.target.value })}
                className="min-h-11 px-2 rounded-[var(--radius)] border border-foreground/15"
              />
              <label className="flex items-center gap-2 min-h-11">
                <input
                  type="checkbox"
                  checked={ex.open}
                  onChange={(e) => setException(i, { open: e.target.checked })}
                  className="w-5 h-5 accent-[var(--accent)]"
                />
                <span className="text-sm text-muted w-24">{ex.open ? "особые часы" : "выходной"}</span>
              </label>
              {ex.open && (
                <>
                  <input
                    type="time"
                    value={ex.from}
                    onChange={(e) => setException(i, { from: e.target.value })}
                    className="min-h-11 px-2 rounded-[var(--radius)] border border-foreground/15"
                  />
                  <span className="text-muted">–</span>
                  <input
                    type="time"
                    value={ex.to}
                    onChange={(e) => setException(i, { to: e.target.value })}
                    className="min-h-11 px-2 rounded-[var(--radius)] border border-foreground/15"
                  />
                </>
              )}
              <button
                onClick={() => setForm({ ...form, schedule: { ...form.schedule, exceptions: form.schedule.exceptions.filter((_, j) => j !== i) } })}
                className="min-w-11 min-h-11 text-red-500"
                aria-label="Удалить"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button onClick={addException} className={styles.fullOutline}>
          + Особый день
        </button>
      </section>

      <div className={styles.actions}>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await saveRestaurant(form);
              setSaved(true);
              setTimeout(() => setSaved(false), 3000);
            })
          }
          className={styles.saveButton}
        >
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
        {saved && <span className="text-green-600">Сохранено ✓</span>}
      </div>
    </div>
  );
}
