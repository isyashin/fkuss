"use client";

import { useEffect, useState } from "react";
import type { ContentSettings } from "@/lib/content-schema";

export function BookingForm({ booking }: { booking: ContentSettings["booking"] }) {
  const [form, setForm] = useState({ date: "", time: "", guests: 2, name: "", phone: "", comment: "", website: "" });
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const minDate = new Date(Date.now() + booking.minHoursAhead * 3600_000).toISOString().slice(0, 10);

  // Загружаем слоты при выборе даты
  useEffect(() => {
    if (!form.date) return;
    setSlotsLoading(true);
    setForm((f) => ({ ...f, time: "" }));
    fetch(`/api/booking/slots?date=${form.date}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [form.date]);

  async function submit() {
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          time: form.time,
          guests: form.guests,
          customerName: form.name,
          customerPhone: form.phone,
          comment: form.comment,
          website: form.website,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ошибка отправки");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="text-center py-12">
        <p className="text-5xl mb-4">✓</p>
        <p className="text-xl font-medium">Заявка отправлена</p>
        <p className="text-muted mt-2">Подтвердим бронь по телефону.</p>
      </div>
    );
  }

  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-muted">Дата</span>
          <input
            type="date"
            min={minDate}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Время</span>
          <select
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
            disabled={!form.date || slotsLoading}
            className={inputCls}
          >
            <option value="">
              {!form.date
                ? "Сначала дата"
                : slotsLoading
                  ? "Загружаю…"
                  : slots === null
                    ? "Выберите"
                    : slots.length === 0
                      ? "Выходной"
                      : "Выберите"}
            </option>
            {(slots ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      {form.date && slots !== null && slots.length === 0 && !slotsLoading && (
        <p className="text-sm text-muted">В этот день ресторан закрыт — выберите другую дату.</p>
      )}
      <label className="block">
        <span className="text-sm text-muted">Гостей</span>
        <input
          type="number"
          min={1}
          max={booking.maxGuestsPerSlot}
          value={form.guests}
          onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted">Имя</span>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoComplete="name"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted">Телефон</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted">Пожелания</span>
        <textarea
          rows={2}
          value={form.comment}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
          className="mt-1 w-full px-3 py-2 rounded-[var(--radius)] bg-card border border-foreground/15"
        />
      </label>

      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={form.website}
        onChange={(e) => setForm({ ...form, website: e.target.value })}
      />

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        onClick={submit}
        disabled={status === "sending" || !form.date || !form.time || !form.name || !form.phone}
        className="w-full min-h-12 rounded-full bg-accent text-white font-medium text-lg disabled:opacity-50"
      >
        {status === "sending" ? "Отправляю…" : "Забронировать"}
      </button>
    </div>
  );
}
