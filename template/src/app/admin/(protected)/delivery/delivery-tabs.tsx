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
      <div className="flex gap-2 mb-4" role="tablist" aria-label="Доставка">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "zones"}
          onClick={() => setTab("zones")}
          className={`min-h-11 px-5 rounded-full text-sm font-medium ${
            tab === "zones" ? "bg-accent text-white" : "bg-card border border-foreground/15"
          }`}
        >
          Зоны на карте
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "options"}
          onClick={() => setTab("options")}
          className={`min-h-11 px-5 rounded-full text-sm font-medium ${
            tab === "options" ? "bg-accent text-white" : "bg-card border border-foreground/15"
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
