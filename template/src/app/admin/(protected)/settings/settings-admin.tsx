"use client";

import { useState, useTransition } from "react";
import { saveSettings, saveTheme } from "./actions";
import type { ContentSettings } from "@/lib/content-schema";
import type { ThemeConfig } from "@/lib/content";

const PRESETS = [
  { id: "warm", name: "Тёплый (трактир)" },
  { id: "minimal", name: "Минимальный" },
  { id: "elegant", name: "Тёмный (fine dining)" },
];

export function SettingsAdmin({ settings, theme }: { settings: ContentSettings; theme: ThemeConfig }) {
  const [s, setS] = useState(settings);
  const [preset, setPreset] = useState(theme.preset);
  const [accent, setAccent] = useState(theme.accent);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState("");

  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  function saveAll() {
    startTransition(async () => {
      await saveSettings(s);
      await saveTheme({ preset, accent });
      setSaved("Сохранено ✓");
      setTimeout(() => setSaved(""), 3000);
    });
  }

  return (
    <div className="space-y-8 max-w-xl">
      <section>
        <h2 className="text-xl mb-3">Тема</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-muted">Пресет</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)} className={inputCls}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">Фирменный цвет</span>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="mt-1 w-16 h-11 rounded" />
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-xl mb-3">Доставка</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.delivery.enabled}
              onChange={(e) => setS({ ...s, delivery: { ...s.delivery, enabled: e.target.checked } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Доставка включена
          </label>
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.delivery.pickupEnabled}
              onChange={(e) => setS({ ...s, delivery: { ...s.delivery, pickupEnabled: e.target.checked } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Самовывоз включён
          </label>
          <label className="block">
            <span className="text-sm text-muted">Минимальная сумма заказа, ₽</span>
            <input
              type="number"
              min={0}
              value={s.delivery.minOrder}
              onChange={(e) => setS({ ...s, delivery: { ...s.delivery, minOrder: Number(e.target.value) } })}
              className={inputCls}
            />
          </label>

          {s.delivery.zones.map((zone, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={zone.name}
                onChange={(e) => {
                  const zones = [...s.delivery.zones];
                  zones[i] = { ...zone, name: e.target.value };
                  setS({ ...s, delivery: { ...s.delivery, zones } });
                }}
                className="flex-1 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
              <input
                type="number"
                min={0}
                value={zone.price}
                title="Цена доставки"
                onChange={(e) => {
                  const zones = [...s.delivery.zones];
                  zones[i] = { ...zone, price: Number(e.target.value) };
                  setS({ ...s, delivery: { ...s.delivery, zones } });
                }}
                className="w-24 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
              <input
                type="number"
                min={0}
                value={zone.freeFrom ?? ""}
                placeholder="Беспл. от"
                title="Бесплатно от"
                onChange={(e) => {
                  const zones = [...s.delivery.zones];
                  zones[i] = { ...zone, freeFrom: e.target.value === "" ? null : Number(e.target.value) };
                  setS({ ...s, delivery: { ...s.delivery, zones } });
                }}
                className="w-28 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
            </div>
          ))}
          <button
            onClick={() => setS({ ...s, delivery: { ...s.delivery, zones: [...s.delivery.zones, { name: "Новая зона", price: 300, freeFrom: null }] } })}
            className="min-h-11 px-4 rounded-full border border-dashed border-foreground/30 text-sm text-muted"
          >
            + Зона
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-xl mb-3">Лояльность</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-muted">Кэшбэк, %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={s.loyalty.cashbackPercent}
              onChange={(e) => setS({ ...s, loyalty: { ...s.loyalty, cashbackPercent: Number(e.target.value) } })}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Списание до, %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={s.loyalty.maxSpendPercent}
              onChange={(e) => setS({ ...s, loyalty: { ...s.loyalty, maxSpendPercent: Number(e.target.value) } })}
              className={inputCls}
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-xl mb-3">Каналы уведомлений</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.channels.telegram.enabled}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, telegram: { ...s.channels.telegram, enabled: e.target.checked } } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Telegram (токен в secrets, chat_id ниже)
          </label>
          {s.channels.telegram.enabled && (
            <input
              value={s.channels.telegram.chatId}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, telegram: { ...s.channels.telegram, chatId: e.target.value } } })}
              placeholder="chat_id группы"
              className={inputCls}
            />
          )}
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.channels.email.enabled}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, email: { ...s.channels.email, enabled: e.target.checked } } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Email для заказов
          </label>
          {s.channels.email.enabled && (
            <input
              value={s.channels.email.address}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, email: { ...s.channels.email, address: e.target.value } } })}
              placeholder="orders@example.ru"
              className={inputCls}
            />
          )}
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.channels.whatsapp.enabled}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, whatsapp: { ...s.channels.whatsapp, enabled: e.target.checked } } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Кнопка «Дублировать в WhatsApp»
          </label>
          {s.channels.whatsapp.enabled && (
            <input
              value={s.channels.whatsapp.phone}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, whatsapp: { ...s.channels.whatsapp, phone: e.target.value } } })}
              placeholder="+79991234567"
              className={inputCls}
            />
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl mb-3">Бронирование</h2>
        <label className="flex items-center gap-3 min-h-11">
          <input
            type="checkbox"
            checked={s.booking.enabled}
            onChange={(e) => setS({ ...s, booking: { ...s.booking, enabled: e.target.checked } })}
            className="w-5 h-5 accent-[var(--accent)]"
          />
          Бронирование включено
        </label>
      </section>

      <div className="flex items-center gap-3 sticky bottom-4">
        <button
          onClick={saveAll}
          disabled={pending}
          className="min-h-12 px-8 rounded-full bg-accent text-white font-medium disabled:opacity-50 shadow-lg"
        >
          {pending ? "Сохраняю…" : "Сохранить всё"}
        </button>
        {saved && <span className="text-green-600">{saved}</span>}
      </div>
    </div>
  );
}
