import { z } from "zod";

// Zod-схемы content/*.json — единственный источник правды о формате.
// Описание формата для людей: docs/CONTENT-SCHEMA.md (держать синхронным).

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id: строчные буквы, цифры, дефисы");

const priceSchema = z.number().int().nonnegative();

const imagePathSchema = z
  .string()
  .regex(/^images\//, "путь картинки начинается с images/");

const dayScheduleSchema = z.object({
  open: z.boolean(),
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
});

const weeklyScheduleSchema = z.object({
  days: z
    .object({
      mon: dayScheduleSchema.optional(),
      tue: dayScheduleSchema.optional(),
      wed: dayScheduleSchema.optional(),
      thu: dayScheduleSchema.optional(),
      fri: dayScheduleSchema.optional(),
      sat: dayScheduleSchema.optional(),
      sun: dayScheduleSchema.optional(),
    })
    .default({}),
  exceptions: z
    .array(dayScheduleSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .default([]),
});

export const restaurantSchema = z.object({
  name: z.string().min(1),
  slug: idSchema,
  cuisine: z.string().default(""),
  phone: z.string().min(5),
  email: z.email(),
  address: z.string().default(""),
  workHours: z
    .array(z.object({ days: z.string(), from: z.string(), to: z.string() }))
    .default([]),
  schedule: weeklyScheduleSchema.optional(),
  socials: z
    .object({
      telegram: z.string().default(""),
      max: z.string().default(""),
      whatsapp: z.string().default(""),
      vk: z.string().default(""),
    })
    .default({ telegram: "", max: "", whatsapp: "", vk: "" }),
  seo: z
    .object({ title: z.string().default(""), description: z.string().default("") })
    .default({ title: "", description: "" }),
  logo: imagePathSchema,
});

export const modifierSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  price: priceSchema,
});

export const modifierGroupSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  position: z.number().int().min(0).default(0),
  minSelected: z.number().int().min(0).default(0),
  maxSelected: z.number().int().min(1).default(1),
  modifiers: z.array(modifierSchema).min(1),
});

export const dishSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  price: priceSchema,
  image: imagePathSchema.or(z.literal("")),
  weight: z.string().default(""),
  tags: z.array(z.string()).default([]),
  modifiers: z.array(modifierSchema).default([]),
  groups: z.array(modifierGroupSchema).default([]),
  available: z.boolean().default(true),
});

export const menuSchema = z.object({
  categories: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        dishes: z.array(dishSchema).min(1),
      }),
    )
    .min(1),
});

export const promosSchema = z.object({
  promos: z.array(
    z.object({
      id: idSchema,
      title: z.string().min(1),
      text: z.string().default(""),
      image: imagePathSchema.or(z.literal("")),
      activeFrom: z.string().nullable().default(null),
      activeTo: z.string().nullable().default(null),
    }),
  ),
});

export const pagesSchema = z.object({
  pages: z.array(
    z.object({
      slug: idSchema,
      title: z.string().min(1),
      body: z.string().default(""),
    }),
  ),
});

export const themeSchema = z.object({
  preset: z.enum(["warm", "minimal", "elegant"]),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontHeading: z.string().min(1),
  fontBody: z.string().min(1),
  radius: z.enum(["sharp", "soft", "round"]).default("soft"),
  dark: z.boolean().default(false),
  homeBlocks: z.array(z.string()).default(["hero", "about", "popular", "promos", "gallery", "contacts"]),
});

export const settingsSchema = z.object({
  domains: z.object({
    canonical: z.string().min(1),
    aliases: z.array(z.string()).default([]),
  }),
  delivery: z.object({
    enabled: z.boolean().default(true),
    pickupEnabled: z.boolean().default(true),
    minOrder: priceSchema.default(0),
    zones: z
      .array(
        z.object({
          name: z.string().min(1),
          price: priceSchema,
          freeFrom: priceSchema.nullable().default(null),
        }),
      )
      .default([]),
  }),
  channels: z.object({
    telegram: z.object({
      enabled: z.boolean().default(false),
      botTokenRef: z.string().default("TELEGRAM_BOT_TOKEN"),
      chatId: z.string().default(""),
    }),
    max: z.object({
      enabled: z.boolean().default(false),
      botTokenRef: z.string().default("MAX_BOT_TOKEN"),
      chatId: z.string().default(""),
    }),
    email: z.object({
      enabled: z.boolean().default(true),
      address: z.email(),
    }),
    whatsapp: z.object({
      enabled: z.boolean().default(false),
      phone: z.string().default(""),
    }),
  }),
  payment: z.object({
    provider: z.enum(["none", "mock", "yookassa"]).default("none"),
    shopIdRef: z.string().default("YOOKASSA_SHOP_ID"),
    secretRef: z.string().default("YOOKASSA_SECRET"),
  }),
  loyalty: z.object({
    cashbackPercent: z.number().min(0).max(100).default(5),
    maxSpendPercent: z.number().min(0).max(100).default(20),
  }),
  pricing: z
    .object({
      globalMode: z.enum(["yandex", "manual", "coefficient"]).default("yandex"),
      globalPercent: z.number().min(-100).max(500).default(0),
    })
    .default({ globalMode: "yandex", globalPercent: 0 }),
  sync: z
    .object({
      enabled: z.boolean().default(false),
      placeSlug: z.string().default(""),
      intervalMinutes: z.number().int().min(5).max(1440).default(60),
    })
    .default({ enabled: false, placeSlug: "", intervalMinutes: 60 }),
  booking: z.object({
    enabled: z.boolean().default(true),
    slotMinutes: z.number().int().min(15).max(180).default(30),
    maxGuestsPerSlot: z.number().int().min(1).default(20),
    minHoursAhead: z.number().min(0).default(2),
  }),
  captcha: z.object({
    provider: z.enum(["none", "smartcaptcha"]).default("none"),
  }),
});

export type ContentRestaurant = z.infer<typeof restaurantSchema>;
export type ContentMenu = z.infer<typeof menuSchema>;
export type ContentSettings = z.infer<typeof settingsSchema>;
export type ContentTheme = z.infer<typeof themeSchema>;
