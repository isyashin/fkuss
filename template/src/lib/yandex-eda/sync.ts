/**
 * Синхронизация меню с Яндекс.Едой.
 * Сопоставление только по externalId. Пропавшее не удаляется.
 * Ручные блюда (source=manual) не трогаем. Состояние — в Settings("syncState").
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { EdaMenu, EdaDish } from "./client";
import { fetchEdaMenu } from "./client";

type PrismaLike = Pick<PrismaClient, "dish" | "category" | "modifierGroup" | "modifier" | "settings" | "$transaction">;

export type MenuFetcher = (placeSlug: string) => Promise<EdaMenu>;

export interface SyncResult {
  ok: boolean;
  error?: string;
  upserted?: number;
  missing?: number;
}

interface SyncStateValue {
  running?: boolean;
  lastAttempt?: string;
  lastSuccess?: string;
  lastStatus?: "ok" | "error";
  lastError?: string;
}

const SYNC_KEY = "syncState";
const SETTINGS_KEY = "settings";

/** Атомарный захват блокировки: true, если удалось встать running=true */
async function acquireLock(prisma: PrismaLike): Promise<boolean> {
  const attempt = new Date().toISOString();
  // Читаем предыдущее состояние, чтобы не потерять lastSuccess/lastStatus
  const previous = (await prisma.settings.findUnique({ where: { key: SYNC_KEY } }))?.value as
    | Record<string, unknown>
    | undefined;
  const value = JSON.parse(JSON.stringify({ ...(previous ?? {}), running: true, lastAttempt: attempt }));
  const updatedFree = await prisma.settings.updateMany({
    where: { key: SYNC_KEY, NOT: { value: { path: ["running"], equals: true } } },
    data: { value },
  });
  if (updatedFree.count > 0) return true;
  if (!previous) {
    // Строки ещё нет — создаём
    try {
      await prisma.settings.create({ data: { key: SYNC_KEY, value } });
      return true;
    } catch {
      return false; // кто-то создал раньше
    }
  }
  return false;
}

async function releaseLock(prisma: PrismaLike, patch: Record<string, unknown>): Promise<void> {
  const current = await getSettingsValue(prisma, SYNC_KEY);
  await setSettingsValue(prisma, SYNC_KEY, { ...current, ...patch, running: false });
}

async function getSettingsValue(prisma: PrismaLike, key: string): Promise<Record<string, unknown>> {
  const row = await prisma.settings.findUnique({ where: { key } });
  return (row?.value ?? {}) as Record<string, unknown>;
}

async function setSettingsValue(prisma: PrismaLike, key: string, value: Record<string, unknown>): Promise<void> {
  await prisma.settings.upsert({
    where: { key },
    create: { key, value: JSON.parse(JSON.stringify(value)) },
    update: { value: JSON.parse(JSON.stringify(value)) },
  });
}

function computeAvailable(manualAvailable: boolean, yandexAvailable: boolean): boolean {
  return manualAvailable && yandexAvailable;
}

async function upsertDish(prisma: PrismaLike, dish: EdaDish): Promise<void> {
  const category = await prisma.category.upsert({
    where: { externalId: dish.categoryExternalId },
    create: {
      id: `ycat-${dish.categoryExternalId}`,
      externalId: dish.categoryExternalId,
      name: dish.categoryName,
      position: dish.categoryPosition,
    },
    update: { name: dish.categoryName, position: dish.categoryPosition },
  });

  const existing = await prisma.dish.findUnique({ where: { externalId: dish.externalId } });
  const yandexAvailable = dish.available;

  if (existing) {
    await prisma.dish.update({
      where: { id: existing.id },
      data: {
        name: dish.name,
        description: dish.description,
        weight: dish.weight,
        categoryId: category.id,
        yandexPrice: dish.price,
        yandexAvailable,
        available: computeAvailable(existing.manualAvailable, yandexAvailable),
        lastSyncedAt: new Date(),
        image: dish.imageUrl && !existing.image ? `images/dishes/${existing.id}.webp` : existing.image,
      },
    });
  } else {
    await prisma.dish.create({
      data: {
        id: `dish-${dish.externalId}`,
        categoryId: category.id,
        name: dish.name,
        description: dish.description,
        price: dish.price ?? 0,
        image: dish.imageUrl ? `images/dishes/dish-${dish.externalId}.webp` : "",
        weight: dish.weight,
        tags: [],
        available: yandexAvailable,
        source: "yandex",
        externalId: dish.externalId,
        yandexAvailable,
        manualAvailable: true,
        yandexPrice: dish.price,
        lastSyncedAt: new Date(),
      },
    });
  }

  // Группы модификаторов по externalId
  const dishRow = await prisma.dish.findUnique({ where: { externalId: dish.externalId } });
  if (!dishRow) return;

  const seenGroupIds = new Set<string>();
  for (const group of dish.groups) {
    const groupId = `${dishRow.id}:g${group.externalId}`;
    seenGroupIds.add(groupId);
    await prisma.modifierGroup.upsert({
      where: { id: groupId },
      create: {
        id: groupId,
        dishId: dishRow.id,
        externalId: group.externalId,
        name: group.name,
        position: group.position,
        minSelected: group.minSelected,
        maxSelected: group.maxSelected,
      },
      update: {
        name: group.name,
        position: group.position,
        minSelected: group.minSelected,
        maxSelected: group.maxSelected,
      },
    });

    const seenOptionIds = new Set<string>();
    for (const option of group.options) {
      const optionId = `${dishRow.id}:g${group.externalId}:o${option.externalId}`;
      seenOptionIds.add(optionId);
      await prisma.modifier.upsert({
        where: { id: optionId },
        create: {
          id: optionId,
          dishId: dishRow.id,
          groupId,
          externalId: option.externalId,
          name: option.name,
          price: option.price ?? 0,
          yandexPrice: option.price,
        },
        update: { name: option.name, yandexPrice: option.price },
      });
    }
    // Опции, исчезнувшие из группы — удаляем (история заказов хранит снимки)
    await prisma.modifier.deleteMany({
      where: { groupId, id: { notIn: [...seenOptionIds] } },
    });
  }
  await prisma.modifierGroup.deleteMany({
    where: { dishId: dishRow.id, id: { notIn: [...seenGroupIds] } },
  });
}

export interface SyncOptions {
  fetchMenu?: MenuFetcher;
  retryDelays?: number[]; // мс между попытками
  placeSlug?: string; // переопределяет настройки (тесты, ручной запуск)
}

export async function syncMenu(prisma: PrismaLike, options: SyncOptions = {}): Promise<SyncResult> {
  const fetcher = options.fetchMenu ?? fetchEdaMenu;
  const retryDelays = options.retryDelays ?? [2000, 5000];

  const settings = (await getSettingsValue(prisma, SETTINGS_KEY)) as {
    sync?: { enabled?: boolean; placeSlug?: string };
  };
  const placeSlug =
    options.placeSlug ??
    settings.sync?.placeSlug ??
    ((await getSettingsValue(prisma, "restaurant")).syncPlaceSlug as string | undefined);
  const state = (await getSettingsValue(prisma, SYNC_KEY)) as SyncStateValue;

  if (!placeSlug) {
    return { ok: false, error: "Не задан placeSlug Яндекс.Еды в настройках" };
  }

  // Блокировка параллельных запусков (атомарная)
  if (!(await acquireLock(prisma))) {
    return { ok: false, error: "Синхронизация уже выполняется" };
  }

  let menu: EdaMenu | null = null;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      menu = await fetcher(placeSlug);
      lastError = null;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retryDelays.length) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt]));
      }
    }
  }

  if (!menu) {
    const message = lastError?.message ?? "неизвестная ошибка";
    await releaseLock(prisma, { lastStatus: "error" as const, lastError: message });
    return { ok: false, error: message };
  }

  try {
    let upserted = 0;
    for (const dish of menu.dishes) {
      await upsertDish(prisma, dish);
      upserted++;
    }

    // Пропавшие из ответа — не удаляем, помечаем недоступными
    const presentIds = menu.dishes.map((d) => d.externalId);
    const missing = await prisma.dish.updateMany({
      where: { source: "yandex", externalId: { notIn: presentIds } },
      data: { yandexAvailable: false, available: false },
    });

    await releaseLock(prisma, {
      lastStatus: "ok" as const,
      lastSuccess: new Date().toISOString(),
      lastError: undefined,
    });

    return { ok: true, upserted, missing: missing.count };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await releaseLock(prisma, { lastStatus: "error" as const, lastError: message });
    return { ok: false, error: message };
  }
}
