"use client";

import { useState } from "react";
import type { ContentSettings } from "@/lib/content-schema";
import type { DeliveryOption } from "@/generated/prisma/client";
import { ZonesTab } from "./zones-tab";
import { DeliveryAdmin } from "./delivery-admin";

export function DeliveryTabs({
  options,
  settings,
  restaurantCenter,
  ymapsKey,
}: {
  options: DeliveryOption[];
  settings: ContentSettings;
  restaurantCenter: { lat: number; lng: number } | null;
  ymapsKey: string;
}) {
  const [tab, setTab] = useState<"zones" | "options">("zones");

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-[var(--rd-line)]" role="tablist" aria-label="Доставка">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "zones"}
          onClick={() => setTab("zones")}
          className={`relative min-h-12 px-3 text-[13px] font-semibold ${
            tab === "zones" ? "text-[var(--rd-text)]" : "text-[var(--rd-muted)] hover:text-[var(--rd-text)]"
          } after:absolute after:right-2 after:left-2 after:-bottom-px after:h-0.5 ${
            tab === "zones" ? "after:bg-[var(--rd-accent)]" : "after:bg-transparent"
          }`}
        >
          Зоны на карте
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "options"}
          onClick={() => setTab("options")}
          className={`relative min-h-12 px-3 text-[13px] font-semibold ${
            tab === "options" ? "text-[var(--rd-text)]" : "text-[var(--rd-muted)] hover:text-[var(--rd-text)]"
          } after:absolute after:right-2 after:left-2 after:-bottom-px after:h-0.5 ${
            tab === "options" ? "after:bg-[var(--rd-accent)]" : "after:bg-transparent"
          }`}
        >
          Варианты доставки
        </button>
      </div>

      {tab === "zones" ? (
        <ZonesTab settings={settings} restaurantCenter={restaurantCenter} ymapsKey={ymapsKey} />
      ) : (
        <DeliveryAdmin options={options} />
      )}
    </div>
  );
}
