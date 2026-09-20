import { describe, it, expect, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { syncMenu, type MenuFetcher } from "@/lib/yandex-eda/sync";
import type { EdaMenu } from "@/lib/yandex-eda/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

function menu(dishes: Partial<import("@/lib/yandex-eda/client").EdaDish>[]): EdaMenu {
  return {
    dishes: dishes.map((d, i) => ({
      externalId: String(100 + i),
      categoryExternalId: "cat1",
      categoryName: "Горячее",
      categoryPosition: 0,
      name: `Блюдо ${i}`,
      description: "",
      price: 500,
      available: true,
      weight: "300 г",
      imageUrl: null,
      groups: [],
      ...d,
    })),
  };
}

const okFetcher = (m: EdaMenu): MenuFetcher => async () => m;
const failFetcher = (error: Error): MenuFetcher => async () => { throw error; };

async function cleanup() {
  // Только данные sync-тестов: блюда dish-<num> (sync) и dish-manual-* — не трогаем ресторан
  await prisma.orderItem.deleteMany({ where: { dishId: { startsWith: "dish-" } } });
  await prisma.modifier.deleteMany({ where: { dishId: { startsWith: "dish-" } } });
  await prisma.modifierGroup.deleteMany({ where: { dishId: { startsWith: "dish-" } } });
  await prisma.dish.deleteMany({
    where: { OR: [{ source: "yandex" }, { id: { startsWith: "dish-manual" } }] },
  });
  await prisma.category.deleteMany({ where: { id: { startsWith: "ycat-" } } });
  await prisma.settings.deleteMany({ where: { key: "syncState" } });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("syncMenu", () => {
  it("первая синхронизация: блюда созданы с externalId, доступностью и ценой", async () => {
    await cleanup();
    const result = await syncMenu(prisma, { placeSlug: "test-slug",
      fetchMenu: okFetcher(menu([{ name: "Плов" }])),
      retryDelays: [],
    });
    expect(result.ok).toBe(true);
    const dish = await prisma.dish.findFirst({ where: { externalId: "100" } });
    expect(dish).not.toBeNull();
    expect(dish!.name).toBe("Плов");
    expect(dish!.source).toBe("yandex");
    expect(dish!.yandexAvailable).toBe(true);
    expect(dish!.yandexPrice).toBe(500);
    expect(dish!.available).toBe(true);
    expect(dish!.lastSyncedAt).not.toBeNull();
  });

  it("стоп: блюдо стало недоступным → yandexAvailable=false, витрина скрыта", async () => {
    await syncMenu(prisma, { placeSlug: "test-slug", fetchMenu: okFetcher(menu([{ name: "Плов" }])), retryDelays: [] });
    await syncMenu(prisma, { placeSlug: "test-slug",
      fetchMenu: okFetcher(menu([{ name: "Плов", available: false }])),
      retryDelays: [],
    });
    const dish = await prisma.dish.findFirst({ where: { externalId: "100" } });
    expect(dish!.yandexAvailable).toBe(false);
    expect(dish!.available).toBe(false);
  });

  it("возврат позиции: доступность восстанавливается, ручные настройки целы", async () => {
    await prisma.dish.update({
      where: { externalId: "100" },
      data: { priceMode: "manual", manualPrice: 700 },
    });
    await syncMenu(prisma, { placeSlug: "test-slug", fetchMenu: okFetcher(menu([{ name: "Плов" }])), retryDelays: [] });
    const dish = await prisma.dish.findFirst({ where: { externalId: "100" } });
    expect(dish!.yandexAvailable).toBe(true);
    expect(dish!.available).toBe(true);
    expect(dish!.priceMode).toBe("manual");
    expect(dish!.manualPrice).toBe(700);
  });

  it("переименование: та же запись по externalId, дубля нет", async () => {
    await syncMenu(prisma, { placeSlug: "test-slug", fetchMenu: okFetcher(menu([{ name: "Плов Супер" }])), retryDelays: [] });
    const dishes = await prisma.dish.findMany({ where: { externalId: "100" } });
    expect(dishes).toHaveLength(1);
    expect(dishes[0].name).toBe("Плов Супер");
  });

  it("пропавшая позиция не удаляется физически", async () => {
    await syncMenu(prisma, { placeSlug: "test-slug", fetchMenu: okFetcher(menu([])), retryDelays: [] });
    const dish = await prisma.dish.findFirst({ where: { externalId: "100" } });
    expect(dish).not.toBeNull();
    expect(dish!.yandexAvailable).toBe(false);
    expect(dish!.available).toBe(false);
  });

  it("ручное блюдо (без externalId) синхронизация не трогает", async () => {
    await prisma.category.create({ data: { id: "ycat-manual", name: "Ручное", position: 99 } });
    await prisma.dish.create({
      data: {
        id: "dish-manual-1",
        categoryId: "ycat-manual",
        name: "Ручное блюдо",
        price: 300,
        available: true,
        source: "manual",
      },
    });
    await syncMenu(prisma, { placeSlug: "test-slug", fetchMenu: okFetcher(menu([])), retryDelays: [] });
    const dish = await prisma.dish.findUnique({ where: { id: "dish-manual-1" } });
    expect(dish!.available).toBe(true);
    expect(dish!.name).toBe("Ручное блюдо");
    await prisma.dish.delete({ where: { id: "dish-manual-1" } });
    await prisma.category.delete({ where: { id: "ycat-manual" } });
  });

  it("ошибка API: меню цело, lastError записан, lastSuccess не изменился", async () => {
    const before = await syncMenu(prisma, { placeSlug: "test-slug", fetchMenu: okFetcher(menu([{ name: "Плов" }])), retryDelays: [] });
    expect(before.ok).toBe(true);
    const stateBefore = await prisma.settings.findUnique({ where: { key: "syncState" } });
    const successBefore = (stateBefore?.value as { lastSuccess?: string })?.lastSuccess;

    const result = await syncMenu(prisma, { placeSlug: "test-slug",
      fetchMenu: failFetcher(new Error("Яндекс.Еда: HTTP 500")),
      retryDelays: [],
    });
    expect(result.ok).toBe(false);
    const dish = await prisma.dish.findFirst({ where: { externalId: "100" } });
    expect(dish).not.toBeNull();
    const state = await prisma.settings.findUnique({ where: { key: "syncState" } });
    const value = state!.value as { lastError?: string; lastSuccess?: string; lastStatus?: string };
    expect(value.lastStatus).toBe("error");
    expect(value.lastError).toContain("500");
    expect(value.lastSuccess).toBe(successBefore);
  });

  it("параллельный запуск блокируется", async () => {
    let resolveFetch: (v: EdaMenu) => void = () => {};
    const slowFetcher: MenuFetcher = () => new Promise((r) => { resolveFetch = r; });
    const first = syncMenu(prisma, { placeSlug: "test-slug", fetchMenu: slowFetcher, retryDelays: [] });
    const second = await syncMenu(prisma, { placeSlug: "test-slug", fetchMenu: okFetcher(menu([])), retryDelays: [] });
    expect(second.ok).toBe(false);
    expect(second.error).toContain("уже выполняется");
    resolveFetch(menu([]));
    await first;
  });

  it("группы модификаторов создаются и обновляются по externalId", async () => {
    await syncMenu(prisma, { placeSlug: "test-slug",
      fetchMenu: okFetcher(
        menu([
          {
            name: "Шашлык",
            groups: [
              {
                externalId: "g1",
                name: "Соусы",
                position: 0,
                minSelected: 1,
                maxSelected: 2,
                options: [
                  { externalId: "o1", name: "Томатный", price: 50 },
                  { externalId: "o2", name: "Аджика", price: 60 },
                ],
              },
            ],
          },
        ]),
      ),
      retryDelays: [],
    });
    const dish = await prisma.dish.findFirst({
      where: { externalId: "100" },
      include: { modifierGroups: { include: { modifiers: true } } },
    });
    expect(dish!.modifierGroups).toHaveLength(1);
    expect(dish!.modifierGroups[0].minSelected).toBe(1);
    expect(dish!.modifierGroups[0].maxSelected).toBe(2);
    expect(dish!.modifierGroups[0].modifiers).toHaveLength(2);
  });
});
