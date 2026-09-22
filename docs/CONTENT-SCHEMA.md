# CONTENT-SCHEMA.md — формат content/

Все файлы валидируются zod-схемами в `scripts/seed.ts`. Ниже — целевой
формат (схемы появятся на этапе 2, документ синхронизируется).

## restaurant.json

```json
{
  "name": "Хинкальная «У Мамы»",
  "slug": "u-mamy",
  "cuisine": "грузинская",
  "phone": "+79991234567",
  "email": "hello@u-mamy.ru",
  "address": "ул. Пушкина, 10, Иваново",
  "workHours": [{ "days": "пн–вс", "from": "11:00", "to": "23:00" }],
  "socials": { "telegram": "", "max": "", "whatsapp": "+79991234567", "vk": "" },
  "seo": { "title": "", "description": "" },
  "logo": "images/logo.png"
}
```

## menu.json

```json
{
  "categories": [
    {
      "id": "khinkali",
      "name": "Хинкали",
      "dishes": [
        {
          "id": "khinkali-baranina",
          "name": "Хинкали с бараниной",
          "description": "5 шт, бульон внутри",
          "price": 320,
          "image": "images/dishes/khinkali-baranina.webp",
          "weight": "300 г",
          "tags": ["hit", "spicy"],
          "modifiers": [
            { "id": "extra", "name": "Добавка 1 шт", "price": 64 }
          ],
          "groups": [
            {
              "id": "sauces",
              "name": "Соусы",
              "position": 0,
              "minSelected": 0,
              "maxSelected": 3,
              "modifiers": [
                { "id": "sauce-tomat", "name": "Томатный", "price": 50 },
                { "id": "sauce-adjika", "name": "Аджика", "price": 60 }
              ]
            }
          ],
          "available": true
        }
      ]
    }
  ]
}
```

Правила: `price` — в рублях, целое; `id` — уникальные slug в пределах файла;
пути картинок относительно `content/`.

## promos.json

```json
{
  "promos": [
    {
      "id": "happy-hour",
      "title": "Счастливые часы",
      "text": "Скидка 20% на хинкали пн–пт 12:00–16:00",
      "image": "images/promos/happy-hour.webp",
      "activeFrom": "2026-01-01",
      "activeTo": null
    }
  ]
}
```

## pages.json

```json
{
  "pages": [
    { "slug": "about", "title": "О нас", "body": "…" },
    { "slug": "delivery", "title": "Доставка и оплата", "body": "…" }
  ]
}
```

`body` — markdown/HTML для Tiptap.

## settings.json

```json
{
  "domains": { "canonical": "u-mamy.нашдомен.ru", "aliases": [] },
  "delivery": {
    "enabled": true,
    "pickupEnabled": true,
    "minOrder": 800,
    "zones": [{ "name": "Центр", "price": 200, "freeFrom": 2000 }]
  },
  "channels": {
    "telegram": { "enabled": false, "botTokenRef": "TELEGRAM_BOT_TOKEN", "chatId": "" },
    "max": { "enabled": false, "botTokenRef": "MAX_BOT_TOKEN", "chatId": "" },
    "email": { "enabled": true, "address": "orders@u-mamy.ru" },
    "whatsapp": { "enabled": true, "phone": "+79991234567" }
  },
  "payment": { "provider": "none", "shopIdRef": "YOOKASSA_SHOP_ID", "secretRef": "YOOKASSA_SECRET" },
  "loyalty": { "cashbackPercent": 5, "maxSpendPercent": 20 },
  "pricing": { "globalMode": "yandex", "globalPercent": 0 },
  "sync": { "enabled": false, "placeSlug": "", "intervalMinutes": 60 },
  "booking": { "enabled": true, "slotMinutes": 30, "maxGuestsPerSlot": 20, "minHoursAhead": 2 },
  "captcha": { "provider": "none" }
}
```

ВАЖНО: значения секретов здесь не хранятся — только ИМЕНА переменных
(`*Ref`), сами значения в `secrets/sites/<slug>.env`.

## theme.json

```json
{
  "preset": "warm",
  "accent": "#b45309",
  "fontHeading": "Playfair Display",
  "fontBody": "Inter",
  "radius": "soft",
  "dark": false,
  "homeBlocks": ["hero", "about", "popular", "promos", "gallery", "contacts"]
}
```

Пресеты: `warm` | `minimal` | `elegant`.

## images/

- `logo.png` — обязателен (нужен для PWA-иконок и шапки).
- `dishes/<dish-id>.webp` — именуются по id блюда.
- Оптимизация (sharp → AVIF/WebP, размеры) — на этапе инжеста/сидирования.

Перед `seed` дополнительно проверяется готовность контента: каждый непустой
путь изображения из `restaurant.json`, `menu.json`, `promos.json` и
`theme.json` должен указывать на существующий обычный файл внутри `content/`.
Пути с traversal и symlink, ведущими наружу, блокируются. Логотип обязателен.
Черновые контакты и canonical `DRAFT_*` (а также домены/email `example.*`)
нужно заменить вручную — `seed` их не пропускает.
