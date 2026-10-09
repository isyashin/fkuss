import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Шаг BUILD пайплайна: манифест + источник → валидный content/.
 * Оба входа: yandex-eda (через записанную фикстуру-ответ API, без сети)
 * и folder (готовая папка с jpg-фото).
 */

const CLI = path.join(__dirname, "..", "scripts", "assemble-content.ts");

async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 120, height: 90, channels: 3, background: { r: 180, g: 90, b: 40 } } })
    .png()
    .toBuffer();
}

async function tinyJpg(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 40, g: 120, b: 60 } } })
    .jpeg()
    .toBuffer();
}

function runAssemble(manifestPath: string, outDir: string, extraEnv: NodeJS.ProcessEnv = {}): void {
  execFileSync(process.execPath, ["--import", "tsx", CLI, "--input", manifestPath, "--out", outDir], {
    stdio: "pipe",
    env: { ...process.env, ...extraEnv },
  });
}

const EDA_MANIFEST = {
  identity: { name: "Тестовая Пиццерия", slug: "smoketest", domain: "https://smoketest.fkuss.ru", cuisine: "пицца" },
  source: { kind: "yandex-eda", url: "https://eda.yandex.ru/r/test_pizza?placeSlug=test_pizza" },
  contacts: {
    phone: "+79990001122",
    phoneConfirmedBy: "owner",
    email: "",
    address: "Москва, тестовый бульвар, 1",
    hours: [{ days: "пн–вс", from: "10:00", to: "22:00", source: "eda" }],
    socials: { telegram: "https://t.me/test", max: "", whatsapp: "", vk: "" },
  },
  business: { deliveryEnabled: true, pickupEnabled: true, minOrder: 500, deliveryZoneName: "Тестово", deliveryPrice: 150 },
  theme: { preset: "warm", accent: "#b91c1c" },
  content: { about: "", deliveryText: "" },
  decisions: { publishWithGaps: true, gaps: ["email"], notes: "" },
  approvedBy: "",
};

const CATALOG_FIXTURE = {
  payload: {
    foundPlace: {
      place: {
        name: "Тестовая Пиццерия",
        slug: "test_pizza",
        tags: [{ name: "Пицца" }, { name: "Суши" }],
        rating: 4.8,
        picture: { uri: "/images/test/logo-{w}x{h}.jpg", ratio: 1.33 },
        footerDescription: "ИП Тестов, г. Москва, Тестовый бульвар, 1, ИНН 7700000000<br><br>Режим работы: с 10:00 до 22:00",
      },
    },
  },
};

const MENU_FIXTURE = {
  payload: {
    categories: [
      {
        id: 100,
        name: "Пицца",
        available: true,
        items: [
          {
            id: 2001,
            name: "Маргарита",
            description: "Сыр, томатный соус",
            available: true,
            price: 450,
            weight: "400 г",
            picture: { uri: "/images/test/margherita-{w}x{h}.jpg", ratio: 1.33 },
            optionsGroups: [
              {
                id: 300,
                name: "Размер",
                required: true,
                minSelected: 1,
                maxSelected: 1,
                options: [
                  { id: 301, name: "30 см", price: 0 },
                  { id: 302, name: "36 см", price: 150 },
                ],
              },
            ],
          },
          { id: 2002, name: "Пепперони", available: true, price: 550, weight: "420 г" },
        ],
      },
      { id: 101, name: "Напитки", available: true, items: [{ id: 2100, name: "Кола", available: true, price: 150, weight: "0.5 л" }] },
    ],
  },
};

describe("assemble-content: источник yandex-eda (фикстура API)", () => {
  let work: string;
  let fixtureDir: string;
  let outDir: string;
  let manifestPath: string;

  beforeAll(async () => {
    work = await mkdtemp(path.join(tmpdir(), "assemble-eda-"));
    fixtureDir = path.join(work, "fixture");
    outDir = path.join(work, "content");
    await mkdir(path.join(fixtureDir, "images"), { recursive: true });
    await writeFile(path.join(fixtureDir, "catalog.json"), JSON.stringify(CATALOG_FIXTURE));
    await writeFile(path.join(fixtureDir, "menu.json"), JSON.stringify(MENU_FIXTURE));
    await writeFile(path.join(fixtureDir, "images", "dish-2001.jpg"), await tinyJpg());
    await writeFile(path.join(fixtureDir, "images", "logo.png"), await tinyPng());
    manifestPath = path.join(work, "site-input.json");
    await writeFile(manifestPath, JSON.stringify(EDA_MANIFEST));

    runAssemble(manifestPath, outDir, { INGEST_FIXTURE_DIR: fixtureDir });
  });

  afterAll(async () => {
    // mkdtemp-папки оставляем ОС (тестовый мусор в TEMP); содержимое мало
  });

  it("собирает валидный content: блюда, группы модификаторов, фото", async () => {
    const menu = JSON.parse(await readFile(path.join(outDir, "menu.json"), "utf-8"));
    expect(menu.categories).toHaveLength(2);
    const pizza = menu.categories[0];
    expect(pizza.dishes).toHaveLength(2);
    const margherita = pizza.dishes[0];
    expect(margherita.id).toBe("dish-2001");
    expect(margherita.price).toBe(450);
    expect(margherita.image).toBe("images/dishes/dish-2001.webp");
    expect(margherita.groups).toHaveLength(1);
    expect(margherita.groups[0].modifiers).toHaveLength(2);
    // Фото из фикстуры сконвертированы в пару webp
    await readFile(path.join(outDir, "images", "dishes", "dish-2001.webp"));
    await readFile(path.join(outDir, "images", "dishes", "dish-2001-sm.webp"));
  });

  it("патчит restaurant.json из манифеста (slug манифеста побеждает slug Еды)", async () => {
    const restaurant = JSON.parse(await readFile(path.join(outDir, "restaurant.json"), "utf-8"));
    expect(restaurant.slug).toBe("smoketest");
    expect(restaurant.name).toBe("Тестовая Пиццерия");
    expect(restaurant.phone).toBe("+79990001122");
    expect(restaurant.email).toBe("smoketest@fkuss.ru"); // платформенный ящик
    expect(restaurant.address).toBe("Москва, тестовый бульвар, 1");
    expect(restaurant.cuisine).toBe("пицца"); // из манифеста, не из тегов Еды
    expect(restaurant.workHours).toEqual([{ days: "пн–вс", from: "10:00", to: "22:00" }]);
  });

  it("патчит settings.json: canonical, доставка, лояльность", async () => {
    const settings = JSON.parse(await readFile(path.join(outDir, "settings.json"), "utf-8"));
    expect(settings.domains.canonical).toBe("https://smoketest.fkuss.ru");
    expect(settings.delivery.enabled).toBe(true);
    expect(settings.delivery.minOrder).toBe(500);
    expect(settings.delivery.zones).toEqual([{ name: "Тестово", price: 150, freeFrom: null }]);
    expect(settings.channels.email.address).toBe("smoketest@fkuss.ru");
    expect(settings.channels.email.enabled).toBe(false);
  });

  it("пишет source-report и кладёт манифест в content/", async () => {
    const report = JSON.parse(await readFile(path.join(outDir, "source-report.json"), "utf-8"));
    expect(report.sources[0].kind).toBe("yandex-eda");
    expect(report.confirmed).toContain("phone (owner)");
    expect(report.unresolved.join(" ")).toContain("email");
    const embedded = JSON.parse(await readFile(path.join(outDir, "site-input.json"), "utf-8"));
    expect(embedded.identity.slug).toBe("smoketest");
  });

  it("генерирует тексты страниц из подтверждённых полей", async () => {
    const pages = JSON.parse(await readFile(path.join(outDir, "pages.json"), "utf-8"));
    const about = pages.pages.find((p: { slug: string }) => p.slug === "about");
    expect(about.body).toContain("Тестовая Пиццерия");
    expect(about.body).toContain("+79990001122");
    const delivery = pages.pages.find((p: { slug: string }) => p.slug === "delivery");
    expect(delivery.body).toContain("150 ₽");
  });
});

describe("assemble-content: источник folder", () => {
  let work: string;
  let folderDir: string;
  let outDir: string;

  beforeAll(async () => {
    work = await mkdtemp(path.join(tmpdir(), "assemble-folder-"));
    folderDir = path.join(work, "owner-folder");
    outDir = path.join(work, "content");
    await mkdir(path.join(folderDir, "images"), { recursive: true });
    await writeFile(
      path.join(folderDir, "restaurant.json"),
      JSON.stringify({
        name: "Кафе У Владельца",
        slug: "owner-cafe",
        cuisine: "домашняя",
        phone: "+79991112233",
        email: "x@example.invalid",
        address: "Подольск, Ленина, 1",
        workHours: [{ days: "пн–вс", from: "09:00", to: "21:00" }],
        socials: { telegram: "", max: "", whatsapp: "", vk: "" },
        seo: { title: "", description: "" },
        logo: "images/logo.png",
      }),
    );
    await writeFile(
      path.join(folderDir, "menu.json"),
      JSON.stringify({
        categories: [
          { id: "cat-soup", name: "Супы", menuId: "", dishes: [
            { id: "dish-borscht", name: "Борщ", description: "", composition: "", price: 300, image: "images/dishes/dish-borscht.webp", weight: "300 г", tags: [], modifiers: [], groups: [], available: true },
          ] },
        ],
      }),
    );
    await writeFile(path.join(folderDir, "settings.json"), JSON.stringify({}));
    await writeFile(path.join(folderDir, "theme.json"), JSON.stringify({ preset: "warm", accent: "#b45309", fontHeading: "Playfair Display", fontBody: "Inter", radius: "soft", dark: false, homeBlocks: [] }));
    await writeFile(path.join(folderDir, "pages.json"), JSON.stringify({ pages: [{ slug: "about", title: "О нас", body: "" }] }));
    await writeFile(path.join(folderDir, "promos.json"), JSON.stringify({ promos: [] }));
    // jpg от владельца — без webp-пары; logo.png
    await writeFile(path.join(folderDir, "images", "dish-borscht.jpg"), await tinyJpg());
    await writeFile(path.join(folderDir, "images", "logo.png"), await tinyPng());

    const manifest = {
      ...EDA_MANIFEST,
      identity: { name: "Кафе У Владельца", slug: "owner-cafe", domain: "https://owner-cafe.fkuss.ru", cuisine: "домашняя" },
      source: { kind: "folder", path: folderDir },
      contacts: {
        phone: "+79991112233",
        phoneConfirmedBy: "owner",
        email: "",
        address: "Подольск, Ленина, 1",
        hours: [{ days: "пн–вс", from: "09:00", to: "21:00", source: "owner" }],
        socials: { telegram: "", max: "", whatsapp: "", vk: "" },
      },
      business: { deliveryEnabled: false, pickupEnabled: true, minOrder: 0, deliveryZoneName: "Город", deliveryPrice: 300 },
    };
    const manifestPath = path.join(work, "site-input.json");
    await writeFile(manifestPath, JSON.stringify(manifest));
    runAssemble(manifestPath, outDir);
  });

  it("нормализует jpg → webp-пара и копирует меню", async () => {
    const menu = JSON.parse(await readFile(path.join(outDir, "menu.json"), "utf-8"));
    expect(menu.categories[0].dishes[0].id).toBe("dish-borscht");
    await readFile(path.join(outDir, "images", "dishes", "dish-borscht.webp"));
    await readFile(path.join(outDir, "images", "dishes", "dish-borscht-sm.webp"));
    await readFile(path.join(outDir, "images", "logo.png"));
  });

  it("deliveryEnabled=false убирает зоны", async () => {
    const settings = JSON.parse(await readFile(path.join(outDir, "settings.json"), "utf-8"));
    expect(settings.delivery.enabled).toBe(false);
    expect(settings.delivery.zones).toEqual([]);
    expect(settings.delivery.pickupEnabled).toBe(true);
  });
});

describe("assemble-content: отказоустойчивость", () => {
  it("падает с понятной ошибкой, если в манифесте нет телефона", async () => {
    const work = await mkdtemp(path.join(tmpdir(), "assemble-bad-"));
    const manifestPath = path.join(work, "site-input.json");
    await writeFile(manifestPath, JSON.stringify({ ...EDA_MANIFEST, contacts: { ...EDA_MANIFEST.contacts, phone: "" } }));
    expect(() => runAssemble(manifestPath, path.join(work, "content"))).toThrow();
  });

  it("падает, если у folder-источника нет обязательных JSON", async () => {
    const work = await mkdtemp(path.join(tmpdir(), "assemble-nofiles-"));
    const emptyFolder = path.join(work, "empty");
    await mkdir(emptyFolder, { recursive: true });
    const manifestPath = path.join(work, "site-input.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...EDA_MANIFEST,
        source: { kind: "folder", path: emptyFolder },
        contacts: { ...EDA_MANIFEST.contacts, address: "где-то", hours: [{ days: "пн–вс", from: "10:00", to: "20:00", source: "owner" }] },
      }),
    );
    expect(() => runAssemble(manifestPath, path.join(work, "content"))).toThrow();
  });
});
