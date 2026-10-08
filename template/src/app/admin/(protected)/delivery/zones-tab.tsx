"use client";

/**
 * Вкладка «Зоны на карте» — по образцу Яндекс.Еды: карта сверху, под ней
 * кнопка добавления и список зон. «Добавить зону» создаёт зону сразу с
 * готовым полигоном вокруг ресторана; выбранную зону можно сразу тянуть
 * за тело/вершины. Тумблер geo-режима и настройка «вне зон» — в шапке.
 */
import { useRef, useState, useTransition } from "react";
import { useSettingsSave } from "../settings/use-settings-save";
import { tariffLines } from "@/lib/order/pricing";
import { defaultZonePolygon } from "@/lib/delivery/geo";
import type { ContentSettings } from "@/lib/content-schema";
import { ZoneMap, zoneColor } from "./zone-map";
import { TariffEditor } from "./tariff-editor";

type Zone = ContentSettings["delivery"]["zones"][number];
type Geo = ContentSettings["delivery"]["geo"];

export function ZonesTab({
  settings,
  restaurantCenter,
  ymapsKey,
}: {
  settings: ContentSettings;
  restaurantCenter: { lat: number; lng: number } | null;
  ymapsKey: string;
}) {
  const [zones, setZones] = useState<Zone[]>(settings.delivery.zones);
  const [geo, setGeo] = useState<Geo>(
    settings.delivery.geo ?? { enabled: false, outside: "block", outsidePrice: 0 },
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    // F21: снапшот строится из тех же значений, что и начальное состояние —
    // иначе форма «грязная» сразу после открытия (geo undefined vs дефолт).
    JSON.stringify([settings.delivery.zones, settings.delivery.geo ?? { enabled: false, outside: "block", outsidePrice: 0 }]),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [drawToken, setDrawToken] = useState(0);
  const [stopDrawToken, setStopDrawToken] = useState(0);
  const [stopEditToken, setStopEditToken] = useState(0);
  const [busy, setBusy] = useState({ drawing: false, editing: false });
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState({ text: "", error: false });
  const { save: saveWithRev, control: revControl } = useSettingsSave();
  const mapApiRef = useRef<{ getCenter: () => [number, number] } | null>(null);

  const inputCls = "min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  function updateZone(index: number, patch: Partial<Zone>) {
    setZones((current) => current.map((z, i) => (i === index ? { ...z, ...patch } : z)));
  }

  function addZone() {
    // Готовый полигон вокруг ресторана; если центр неизвестен — вокруг центра карты
    const center = restaurantCenter ??
      (() => {
        const c = mapApiRef.current?.getCenter();
        return c ? { lat: c[0], lng: c[1] } : null;
      })();
    const zone: Zone = {
      name: `Зона ${zones.length + 1}`,
      enabled: true,
      deliveryMinutes: null,
      tariffs: [{ from: 0, price: 300 }],
      ...(center ? { polygon: defaultZonePolygon(center) } : {}),
    };
    setZones((current) => [...current, zone]);
    setSelected(zones.length); // выбор сразу входит в режим правки
  }

  function removeZone(index: number) {
    setZones((current) => current.filter((_, i) => i !== index));
    if (selected === index) setSelected(null);
    if (selected !== null && selected > index) setSelected(selected - 1);
  }

  function save() {
    startTransition(async () => {
      setFeedback({ text: "", error: false });
      try {
        const next: ContentSettings = {
          ...settings,
          delivery: { ...settings.delivery, zones, geo },
        };
        const revResult = await saveWithRev(next); if (revResult !== "ok") { if (revResult === "error") throw new Error("Не удалось сохранить"); return; }
        setSavedSnapshot(JSON.stringify([zones, geo]));
        setFeedback({ text: "Сохранено", error: false });
      } catch (cause) {
        setFeedback({
          text: cause instanceof Error ? cause.message : "Не удалось сохранить",
          error: true,
        });
      }
    });
  }

  const dirty = JSON.stringify([zones, geo]) !== savedSnapshot;

  return (
    <div className="space-y-4">
      {/* Geo-режим: общий переключатель и поведение «вне зон» */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-3 min-h-11">
          <input
            type="checkbox"
            checked={geo.enabled}
            onChange={(e) => setGeo({ ...geo, enabled: e.target.checked })}
            className="w-5 h-5 accent-[var(--accent)]"
          />
          Зоны на карте (автоопределение по адресу гостя)
        </label>
        {geo.enabled && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={geo.outside}
              onChange={(e) => setGeo({ ...geo, outside: e.target.value as Geo["outside"] })}
              className={inputCls}
              aria-label="Если адрес вне всех зон"
            >
              <option value="block">Вне зон: запретить доставку</option>
              <option value="allow">Вне зон: разрешить с ценой</option>
            </select>
            {geo.outside === "allow" && (
              <input
                type="number"
                min={0}
                step={50}
                value={geo.outsidePrice}
                aria-label="Цена доставки вне зон, ₽"
                onChange={(e) => setGeo({ ...geo, outsidePrice: Math.max(0, Number(e.target.value) || 0) })}
                className={`${inputCls} w-32`}
              />
            )}
          </div>
        )}
        {/* F21: сохранение появляется только при изменениях */}
        {dirty && (
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-sm text-muted">Есть несохранённые изменения</span>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="min-h-11 px-5 rounded-md bg-accent text-white text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
        )}
        <div className="flex items-center gap-3 ml-auto">
          {feedback.text && (
            <span role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-red-600" : "text-sm text-green-700"}>
              {feedback.text}
            </span>
          )}
        </div>
      </div>
      {geo.enabled && (
        <p className="text-sm text-muted">
          Гость вводит адрес — сервер сам определит зону. Для геокодинга нужен ключ Яндекс.Карт (задаётся при развёртывании сайта).
        </p>
      )}

      <div className="relative">
        <ZoneMap
          ymapsKey={ymapsKey}
          zones={zones}
          selectedIndex={selected}
          restaurantCenter={restaurantCenter}
          onZonesChange={setZones}
          onSelect={setSelected}
          drawToken={drawToken}
          stopDrawToken={stopDrawToken}
          stopEditToken={stopEditToken}
          onBusyChange={setBusy}
          onMapApi={(api) => {
            mapApiRef.current = api;
          }}
        />
        {(busy.drawing || busy.editing) && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-black/70 text-white text-sm px-4 py-2 rounded-md pointer-events-none">
            {busy.drawing
              ? "Рисование: клик — точка, «Готово» или двойной клик — завершить"
              : "Перетаскивайте зону и точки границы; «Готово» — закончить"}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={addZone}
        disabled={busy.drawing || busy.editing}
        className="min-h-11 px-5 rounded-md bg-accent text-white text-sm font-medium disabled:opacity-50"
      >
        + Добавить зону
      </button>

      <div className="divide-y divide-foreground/10 border border-foreground/10 rounded-[var(--radius)]">
        {zones.length === 0 && (
          <p className="p-4 text-sm text-muted">Зон пока нет — добавьте первую кнопкой выше.</p>
        )}
        {zones.map((zone, i) => {
          const expanded = selected === i;
          const color = zoneColor(i);
          const hasPolygon = (zone.polygon?.length ?? 0) >= 3;
          const zoneDisabled = zone.enabled === false;

          const toggle = (
            <input
              type="checkbox"
              checked={!zoneDisabled}
              onChange={(e) => updateZone(i, { enabled: e.target.checked })}
              className="w-5 h-5 accent-[var(--accent)] shrink-0"
              aria-label={`Зона «${zone.name}» включена`}
            />
          );
          const dot = (
            <span
              className="w-4 h-4 rounded-md shrink-0"
              style={{ backgroundColor: color.stroke }}
              aria-hidden="true"
            />
          );

          return (
            <div key={i} className={zoneDisabled ? "opacity-60" : ""}>
              {!expanded ? (
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  className="w-full flex items-center gap-3 min-h-14 px-4 text-left"
                  aria-expanded={false}
                >
                  {dot}
                  {toggle}
                  <span className="flex-1 min-w-0">
                    <span className="font-medium">{zone.name}</span>
                    {!hasPolygon && <span className="text-amber-600 text-sm ml-2">без полигона</span>}
                    <span className="block text-sm text-muted">
                      {tariffLines(zone).map((line, li) => (
                        <span key={li} className="block">
                          {line}
                        </span>
                      ))}
                      {zone.deliveryMinutes != null && <span className="block">~{zone.deliveryMinutes} мин</span>}
                    </span>
                  </span>
                  <span className="text-muted shrink-0" aria-hidden="true">
                    ▸
                  </span>
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-4 pt-3">
                    {dot}
                    {toggle}
                    <input
                      value={zone.name}
                      onChange={(e) => updateZone(i, { name: e.target.value })}
                      aria-label="Название зоны"
                      placeholder="Название зоны"
                      className="flex-1 min-w-0 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="text-muted min-w-11 min-h-11 text-lg"
                      aria-label="Свернуть"
                    >
                      ▾
                    </button>
                  </div>

                  <div className="px-4 pb-4 pt-2 space-y-3">
                    <TariffEditor
                      tariffs={zone.tariffs ?? [{ from: 0, price: zone.price ?? 300 }]}
                      onChange={(tariffs) => updateZone(i, { tariffs })}
                    />

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted">Время</span>
                      <input
                        type="number"
                        min={0}
                        max={480}
                        value={zone.deliveryMinutes ?? ""}
                        aria-label="Время доставки, минут"
                        onChange={(e) =>
                          updateZone(i, {
                            deliveryMinutes: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-24 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                      />
                      <span className="text-sm text-muted">мин</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {(busy.editing || busy.drawing) && (
                        <button
                          type="button"
                          onClick={() =>
                            busy.drawing ? setStopDrawToken((t) => t + 1) : setStopEditToken((t) => t + 1)
                          }
                          className="min-h-11 px-4 rounded-md bg-accent text-white text-sm font-medium"
                        >
                          Готово
                        </button>
                      )}
                      {!hasPolygon && !busy.drawing && (
                        <button
                          type="button"
                          onClick={() => setDrawToken((t) => t + 1)}
                          className="min-h-11 px-4 rounded-md border border-foreground/20 text-sm"
                        >
                          Нарисовать
                        </button>
                      )}
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => removeZone(i)}
                        className="text-sm text-red-600 min-h-11 px-2"
                      >
                        Удалить зону
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    {revControl}</div>
  );
}
