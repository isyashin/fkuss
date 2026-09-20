# ARCHITECTURE.md — архитектура

## Стек

Next.js (App Router) + Tailwind CSS + shadcn/ui + Prisma + PostgreSQL.
Один репозиторий: витрина, API-роуты, админка. Деплой: Docker + Caddy.

## Принцип: контент отделён от кода

```
template/
├── content/                  # ЕДИНСТВЕННОЕ, что правит агент наполнения
│   ├── restaurant.json       # название, адрес, телефоны, часы, соцсети, SEO
│   ├── menu.json             # категории, блюда, цены, модификаторы
│   ├── promos.json           # акции
│   ├── pages.json            # тексты страниц (о нас, доставка, контакты)
│   ├── settings.json         # доставка, каналы, платёжка, лояльность, бронь
│   ├── theme.json            # пресет, accent, шрифты, блоки главной
│   └── images/               # dishes/, gallery/, promos/, logo
├── src/                      # код шаблона (агенту наполнения запрещён)
├── scripts/seed.ts           # content/ → БД (zod-валидация)
└── docker-compose.yml
```

Поток данных: `content/` → `seed.ts` (zod-валидация) → PostgreSQL →
витрина/админка. Админка правит БД напрямую (после сборки сайт живёт
без `content/`).

## Структура src/ (этап 1+)

```
src/
├── app/
│   ├── (site)/            # витрина: главная (hero + полное меню), акции, контакты
│   ├── banquets/          # банкеты (404 при выключенном разделе)
│   ├── booking/           # бронирование
│   ├── account/           # личный кабинет
│   ├── admin/             # админка (заказы, брони, меню, акции, галерея,
│   │                      # страницы, ресторан+часы, синхронизация, доставка,
│   │                      # банкеты, настройки+тема/фон, подписка)
│   └── api/               # order, booking(+slots), auth, payments/webhook,
│                          # delivery/slots, jobs (sync-menu, report-metrics),
│                          # admin (upload, dish-image), content-asset
├── components/            # UI (menu-client, cart, booking, install-prompt,
│                          # offline-banner)
├── lib/
│   ├── yandex-eda/        # client.ts (timeout, нормализация) + sync.ts
│   │                      # (upsert по externalId, атомарный lock, retry)
│   ├── order/             # pricing.ts (расчёт заказа), price-resolver.ts
│   │                      # (режимы цен), recompute.ts, modifier-validation.ts
│   ├── delivery/          # slots.ts (окна с tz, валидация)
│   ├── payments/          # PaymentProvider + yookassa + mock
│   ├── notify/            # telegram, max, email
│   ├── loyalty/           # бонусы (ledger)
│   ├── pwa-icons.ts       # генерация иконок из логотипа + fallback
│   ├── hours.ts           # часы работы (расписание + исключения)
│   ├── site.ts            # данные витрины из БД с fallback на content/
│   └── theme/             # токены и пресеты (+ фоновое изображение)
└── styles/
```

Ключевые потоки (по ТЗ):
- **Синхронизация**: cron → /api/jobs/sync-menu → syncMenu → EDA API →
  upsert по externalId; состояние в Settings(syncState); доступность блюда =
  manualAvailable && yandexAvailable; после sync — recomputePrices.
- **Цены**: settings.pricing (globalMode/globalPercent) + поля блюда
  (priceMode/manualPrice/coefficientPercent) → price-resolver → Dish.price —
  единственная цена для заказа и витрины.
- **Доставка**: DeliveryOption → /api/delivery/slots → окна с tz → выбор в
  корзине → серверная валидация + снимок в Order; зоны заменяются вариантами.
- **Меню на главной**: hero → MenuClient (тот же компонент) → о нас/контакты;
  /menu → redirect /#menu.

## Мультитенантность

- Один сервер, один общий PostgreSQL-процесс; на ресторан — **своя база
  и свой пользователь** (изоляция на уровне прав СУБД).
- На ресторан — свой контейнер приложения (образ общий), свой volume
  для images, свой `.env` из `secrets/sites/<name>.env`.
- Caddy маршрутизирует по домену → порт контейнера.
- Лимиты CPU/RAM в compose на каждый стек.
- Обновление шаблона: пересборка образа + `deploy.sh --all` (или `--site`).

## Платформа владельца (SaaS-слой)

Отдельное приложение `platform/` в этом же репозитории (монорепо):

```
platform/
├── app/                  # Next.js: админка владельца + кабинет владельца сайта
└── app/api/metrics/      # приём агрегатов от сайтов (site key)
```

- Своя БД в общем PostgreSQL, свой поддомен `admin.нашдомен.ru`.
- Платформа НЕ имеет доступа к данным гостей ресторанов — только агрегаты.
- **Метрики**: сайт раз в N часов шлёт на platform API снапшот
  (заказы: count/sum, брони, просмотры страниц) с заголовком site key.
  Просмотры считает собственный лёгкий счётчик в шаблоне
  (route handler + таблица PageView, агрегация при отправке).
- **Биллинг**: баланс, тариф, ежедневное списание (cron в платформе),
  уведомления за 7/3/1 дней, льготный период, приостановка (Caddy отдаёт
  заглушку), реактивация после оплаты. Оплата — ЮKassa платформы,
  переиспользуется PaymentProvider. PDF-счета для юрлиц.
- **Экспорт сайта**: платформа вызывает скрипт на хосте → архив
  content/ + pg_dump базы сайта + images → временная ссылка.
- Подробности и правила денег: `docs/BILLING.md`.

## Домены и TLS

- Субдомены `*.нашдомен.ru`: A-запись wildcard на IP; Caddy выпускает
  per-subdomain сертификаты автоматически (HTTP/TLS-ALPN challenge).
- Собственный домен клиента: клиент создаёт A-запись на наш IP;
  `deploy.sh --domain=` добавляет домен; Caddy on-demand TLS с ask-эндпоинтом
  (allowlist доменов из реестра сайтов).
- Переезд субдомен → свой домен: 301-редирект со старого адреса.
- Canonical домен хранится в настройках сайта и используется в письмах,
  мессенджерах, PWA-манифесте, Open Graph.

## Поток заказа

1. Клиент собирает корзину на клиенте (zustand + localStorage).
2. POST /api/order: сервер пересчитывает сумму по БД (клиентской сумме
   не доверяем), проверяет антибот (honeypot, rate limit, SmartCaptcha —
   если включена).
3. Заказ сохраняется (статус «новый»), запускаются уведомления в каналы
   (Telegram/MAX/email — те, что включены в настройках).
4. Если выбрана онлайн-оплата — PaymentProvider.createPayment, редирект
   на оплату; webhook меняет статус.
5. «Оплата при получении» — заказ сразу уходит в каналы.

## Поток бонусов

- `BonusTransaction`: type = accrual | spend | reversal, orderId, amount.
- Начисление — при переходе заказа в «выполнен» (X% от суммы, не включая
  оплаченную бонусами часть).
- Списание — при оформлении (до Y% суммы заказа).
- Отмена заказа — сторно начисленных; потраченные бонусы возвращаются.

## Безопасность

- Секреты: `secrets/`, права 600 на сервере, в git не попадают.
- Rate limits: создание заказа, запрос кода входа, ввод кода.
- Админка: отдельная аутентификация ресторатора (не путать с гостевой).
- Вебхуки платёжки: проверка подписи/IP по документации провайдера.
