# DEPLOY.md — сервер, домены, деплой, бэкапы

## Текущее состояние (dev-ВМ, LAN)

Хост: `RESTOSITE` (192.168.88.153), Ubuntu 26.04, Docker 29, Caddy 2.6.
Доступ по SSH-ключу (`secrets/server.env`).

```
/home/ilya/resto/
├── template/               # исходники шаблона + compose (сайт u-mamy, :3000)
├── platform/               # платформа владельца (:3100)
├── registry.json           # реестр сайтов: slug → порт, домены
├── sites/<slug>/           # compose + .env + content/ сайта
├── scripts/                # deploy.sh, backup.sh, export-site.sh
└── backups/                # дампы БД + content (14 последних)
```

Работающие сервисы:
- `template-app-1` (u-mamy) — :3000, БД `resto`
- `buxara-app-1` — :3001, БД `buxara`, content volume
- `platform-platform-1` — :3100, БД `platform`
- `template-db-1` — общий PostgreSQL (базы разделены по сайтам)
- Caddy :80 — маршрутизация по Host (LAN-режим, без реального TLS)

Cron на хосте:
- `*/6h` — POST /api/jobs/report-metrics на сайтах (метрики → платформа)
- `04:30` — POST /api/jobs/billing-daily на платформе (списания, уведомления)
- `05:00` — `scripts/backup.sh`

Джобы реализованы HTTP-роутами внутри приложений и защищены
`X-Cron-Secret` — не требуют node на хосте.

## Прод-VPS (когда будет публичный IP и домен)

1. DNS: A-запись `*.нашдомен.ru` → IP сервера (+ сам `нашдомен.ru`).
2. Caddyfile: заменить LAN-хосты на реальные домены — TLS выпустится
   автоматически (per-domain, HTTP/TLS-ALPN).
3. Собственные домены клиентов: on-demand TLS с ask-эндпоинтом
   `http://platform:3000/api/tls-ask` (allowlist = Site.domains в платформе).
4. SMTP: Яндекс 360 или провайдер; DKIM/SPF/DMARC на общем домене;
   завести `SMTP_URL`/`SMTP_FROM` в env платформы и сайтов.
5. ufw (22, 80, 443), fail2ban — включить.
6. Секреты: `secrets/sites/<slug>.env` → env сайта (токены ботов, платёжка).

## Нюанс кук (всплыло на LAN-ВМ)

Сессии (админка/кабинет/гости) ставят `Secure`-куки в production. По
чистому http браузер их не хранит → вход «проходит», но выбрасывает на
логин. На LAN/тесте по http добавлять `INSECURE_HTTP=1` в env сайта и
платформы. На проде с HTTPS флаг НЕ ставить.

## Где живёт биллинг

Баланс/счета за сам сайт — в кабинете платформы (`/cabinet`), не в админке
ресторана. В шапке админки ресторана есть ссылка «Баланс и подписка →»
(env сайта `PLATFORM_PUBLIC_URL`).

## Деплой нового сайта

```bash
bash ~/resto/scripts/deploy.sh <slug> [--domain=example.ru]
# deploy.sh сам: выделяет порт (registry.json), создаёт per-site
# пользователя БД с паролем и базу, пишет .env (DATABASE_URL,
# ADMIN_PASSWORD, CRON_SECRET, права 600), поднимает контейнер.
# Далее: контент в sites/<slug>/content (см. инжест), затем
# seed: с локальной машины
DATABASE_URL=... CONTENT_DIR=<путь> npm run seed
```

Изоляция БД: у каждого сайта свой пользователь `site_<slug>` и своя база —
один сайт не читает чужие данные. Пароль общего суперпользователя —
только в env postgres-контейнера, порт 5432 на проде наружу не публикуем.

## Бэкапы и экспорт

- Автомат: `backup.sh` по cron (дампы БД + content, 14 последних).
- Экспорт для клиента: `export-site.sh <slug>` → tar.gz в backups/export/.
