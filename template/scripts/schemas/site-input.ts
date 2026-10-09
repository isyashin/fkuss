/**
 * Схема входного манифеста site-input.json — единый контракт пайплайна
 * «ресторан → сайт». Агент заполняет манифест опросом владельца, скрипты
 * (assemble-content.ts, provision-site.sh) исполняют по нему без вопросов.
 * Деплой разрешён только при непустом approvedBy (шаг REVIEW пайплайна).
 */
import { z } from "zod";

const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug: строчные латинские буквы, цифры, дефисы")
  .max(58, "slug: не длиннее 58 символов");

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "время в формате ЧЧ:ММ");

export const siteInputSchema = z.object({
  identity: z.object({
    name: z.string().min(1, "identity.name обязателен"),
    slug: slugSchema,
    /** Полный canonical, например https://pizza24.fkuss.ru */
    domain: z.string().min(1, "identity.domain обязателен"),
    cuisine: z.string().default(""),
  }),

  /** Источник меню — контракт на весь прогон. eda: добираем по лестнице
   *  устойчивости, к папке НЕ переключаемся без явной команды пользователя. */
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("yandex-eda"),
      url: z.string().url().includes("eda.yandex.ru", { message: "url: ожидается ссылка Яндекс.Еды" }),
    }),
    z.object({
      kind: z.literal("folder"),
      /** Папка с content/*.json и images/ (структура — как в sites/<slug>/content) */
      path: z.string().min(1),
    }),
  ]),

  contacts: z.object({
    phone: z.string().min(5, "contacts.phone обязателен (реальный номер, не выдумывать)"),
    phoneConfirmedBy: z.enum(["owner", "maps+site", "unconfirmed"]).default("unconfirmed"),
    /** Пусто → служебный ящик платформы <slug>@fkuss.ru (email-канал выключен) */
    email: z.string().default(""),
    address: z.string().default(""),
    hours: z
      .array(
        z.object({
          days: z.string().min(1),
          from: timeSchema,
          to: timeSchema,
          source: z.enum(["owner", "eda", "maps"]).default("owner"),
        }),
      )
      .default([]),
    socials: z
      .object({
        telegram: z.string().default(""),
        max: z.string().default(""),
        whatsapp: z.string().default(""),
        vk: z.string().default(""),
      })
      .default({ telegram: "", max: "", whatsapp: "", vk: "" }),
  }),

  business: z
    .object({
      deliveryEnabled: z.boolean().default(true),
      pickupEnabled: z.boolean().default(true),
      minOrder: z.number().int().nonnegative().default(0),
      deliveryZoneName: z.string().min(1).default("Город"),
      deliveryPrice: z.number().int().nonnegative().default(300),
      bookingEnabled: z.boolean().default(true),
      cashbackPercent: z.number().int().min(0).max(100).default(5),
      maxSpendPercent: z.number().int().min(0).max(100).default(20),
    })
    .default({
      deliveryEnabled: true,
      pickupEnabled: true,
      minOrder: 0,
      deliveryZoneName: "Город",
      deliveryPrice: 300,
      bookingEnabled: true,
      cashbackPercent: 5,
      maxSpendPercent: 20,
    }),

  theme: z
    .object({
      preset: z.enum(["warm", "minimal", "elegant"]).default("warm"),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#b45309"),
    })
    .default({ preset: "warm", accent: "#b45309" }),

  /** Авторские тексты; пусто → шаблоны из подтверждённых полей */
  content: z
    .object({ about: z.string().default(""), deliveryText: z.string().default("") })
    .default({ about: "", deliveryText: "" }),

  decisions: z
    .object({
      publishWithGaps: z.boolean().default(true),
      gaps: z.array(z.string()).default([]),
      notes: z.string().default(""),
    })
    .default({ publishWithGaps: true, gaps: [], notes: "" }),

  /** Подтверждение шага REVIEW: "<кто> <дата>". Без него deploy не стартует */
  approvedBy: z.string().default(""),
});

export type SiteInput = z.infer<typeof siteInputSchema>;

/** Кросс-полевые правила, которые zod не выражает */
export function validateSiteInput(input: SiteInput): string[] {
  const errors: string[] = [];
  if (input.source.kind === "folder" && !input.contacts.address) {
    errors.push("contacts.address обязателен для источника folder (у Еды адрес подтверждается отдельно)");
  }
  if (input.source.kind === "folder" && input.contacts.hours.length === 0) {
    errors.push("contacts.hours обязательны для источника folder (у Еды часы берутся из карточки)");
  }
  if (!input.identity.domain.startsWith("https://")) {
    errors.push("identity.domain: укажите полный URL с https://");
  }
  return errors;
}

/** Служебный ящик платформы, если реальный email не задан */
export function platformEmail(slug: string): string {
  return `${slug}@fkuss.ru`;
}
