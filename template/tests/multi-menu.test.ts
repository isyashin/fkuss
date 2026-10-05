import { describe, expect, it } from "vitest";
import { groupCategoriesByMenu, menuSwitchItems, resolveMenuName, syncSources } from "@/lib/multi-menu";

const menus = [
  { id: "khinkali", name: "Хинкальная" },
  { id: "pirogi", name: "Пироги и пицца" },
];

describe("multi-menu helpers", () => {
  it("resolveMenuName: находит название, пусто для без группы и неизвестного id", () => {
    expect(resolveMenuName(menus, "khinkali")).toBe("Хинкальная");
    expect(resolveMenuName(menus, "pirogi")).toBe("Пироги и пицца");
    expect(resolveMenuName(menus, "")).toBe("");
    expect(resolveMenuName(menus, null)).toBe("");
    expect(resolveMenuName(menus, "unknown")).toBe("");
  });

  it("groupCategoriesByMenu: группирует по меню, неизвестные menuId — вне групп", () => {
    const cats = [
      { id: "c1", menuId: "pirogi" },
      { id: "c2", menuId: "khinkali" },
      { id: "c3", menuId: "" },
      { id: "c4", menuId: "ghost" },
      { id: "c5", menuId: "khinkali" },
    ];
    const groups = groupCategoriesByMenu(menus, cats);
    expect(groups.map((g) => [g.menu?.id ?? null, g.categories.map((c) => c.id)])).toEqual([
      ["khinkali", ["c2", "c5"]],
      ["pirogi", ["c1"]],
      [null, ["c3", "c4"]],
    ]);
  });

  it("groupCategoriesByMenu: без меню все категории — одна группа «вне групп»", () => {
    const groups = groupCategoriesByMenu([], [{ id: "c1", menuId: "" }]);
    expect(groups).toEqual([{ menu: null, categories: [{ id: "c1", menuId: "" }] }]);
  });

  it("syncSources: приоритет sources, легаси placeSlug как fallback", () => {
    expect(syncSources({})).toEqual([]);
    expect(syncSources({ placeSlug: "  " })).toEqual([]);
    expect(syncSources({ placeSlug: "batono_w98td" })).toEqual([{ placeSlug: "batono_w98td", menuId: null }]);
    expect(
      syncSources({
        placeSlug: "legacy",
        sources: [
          { placeSlug: " a ", menuId: "khinkali" },
          { placeSlug: "", menuId: "pirogi" },
          { placeSlug: "picceriya__1", menuId: "" },
        ],
      }),
    ).toEqual([
      { placeSlug: "a", menuId: "khinkali" },
      { placeSlug: "picceriya__1", menuId: null },
    ]);
  });

  it("menuSwitchItems: без групп — пусто (переключатель скрыт на одноменю-сайтах)", () => {
    const cats = [{ id: "c1", menuId: "" }, { id: "c2", menuId: "" }];
    expect(menuSwitchItems([], cats)).toEqual([]);
  });

  it("menuSwitchItems: группы с категориями + «Меню» для незагруппированных; пустые группы скрыты", () => {
    const menus = [
      { id: "khinkali", name: "Хинкальная" },
      { id: "pirogi", name: "Пироги и пицца" },
      { id: "empty", name: "Пустая группа" },
    ];
    const cats = [
      { id: "c1", menuId: "khinkali" },
      { id: "c2", menuId: "" },
    ];
    expect(menuSwitchItems(menus, cats)).toEqual([
      { id: "khinkali", name: "Хинкальная" },
      { id: "", name: "Меню" },
    ]);
    // все категории в группах — чипа «Меню» нет
    expect(menuSwitchItems(menus, [{ id: "c1", menuId: "pirogi" }])).toEqual([
      { id: "pirogi", name: "Пироги и пицца" },
    ]);
  });
});
