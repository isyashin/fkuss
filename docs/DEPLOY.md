# DEPLOY.md — сервер, домены, деплой, бэкапы

## Ёмкость сервера (измерено на dev-ВМ, idle)

- Сайт ресторана: ~60–65 МБ RAM (пик под нагрузкой ~200–350 МБ)
- Платформа: ~60 МБ, PostgreSQL общий: ~35 МБ, ОС+Caddy: ~650 МБ
- Прод (3,3 ГБ): **~12 сайтов комфортно**; 8 CPU не являются узким местом
  при ресторанном трафике
- Диск 30 ГБ: бэкапы доминируют (~850 МБ/сайт при 14 днях) — при росте
  сократить ретенцию до 7 дней или выносить бэкапы наружу
- Шкала: ~15 сайтов → апгрейд RAM до 8 ГБ; 50+ → PostgreSQL выносится

## Продакшн (217.65.3.123, fkuss.ru)

Хост: `fkuss`, Ubuntu 26.04, 8 CPU / 3,3 ГБ RAM / 15 ГБ диск.
Доступ по SSH-ключу (`secrets/prod.env`). Домен проекта: `fkuss.ru`.

- A-запись `fkuss.ru` → 217.65.3.123 — **уже настроена** (резолвится).
- ⚠️ Wildcard `*.fkuss.ru` — **не настроен**. Нужно добавить у регистратора
  DNS: A-запись `*.fkuss.ru` → 217.65.3.123. Она покроет и субдомены сайтов,
  и `admin.fkuss.ru` (платформа).
- git/SSH готовы; Docker/Caddy — ставить (см. чек-лист ниже).

Чек-лист вывода в прод:
1. DNS wildcard `*.fkuss.ru` → 217.65.3.123 — **[x] настроено и резолвится**
2. Docker + Compose, Caddy, ufw (22/80/443), fail2ban — **[x] установлено:**
   - Диск расширен: LVM LV 15 → 30 ГБ (был весь диск 32 ГБ, LV обрезан)
   - Все обновления Ubuntu применены, `unattended-upgrades` активен
   - ufw: только 22/80/443; fail2ban active
   - Docker 29.1.3 + compose, Caddy 2.6.2, пользователь ilya в группе docker
3. `git clone` fkuss → `~/resto/src`; env-файлы из `secrets/` (не в git)
4. Caddyfile: `*.fkuss.ru` → сайты, `admin.fkuss.ru` → платформа
   (per-domain TLS автоматически, HTTP/TLS-ALPN через открытые 80/443)
5. SMTP (DKIM/SPF/DMARC на fkuss.ru) → коды входа и уведомления
6. Крон-джобы (метрики, sync-menu, биллинг, экспорт, бэкап) по образцу dev-ВМ
7. Первый сайт: `deploy.sh <slug>` → seed → проверка по HTTPS

## Текущее состояние (dev-ВМ, LAN)

Хост: `RESTOSITE` (192.168.88.153), Ubuntu 26.04, Docker 29, Caddy 2.6.
Доступ по SSH-ключу (`secrets/server.env`).

**Исходники — из git** (`https://github.com/isyashin/fkuss`, ветка main):

```
/home/ilya/resto/
├── src/                    # git clone fkuss (код: template/, platform/, scripts/)
│   ├── template/.env       # env сайта u-mamy (не в git)
│   └── platform/docker-compose.yml  # env-специфика платформы (не в git)
├── registry.json           # реестр сайтов: slug → порт, домены
├── sites/<slug>/           # compose + .env + content/ сайта
├── backups/                # дампы БД + content (14 последних)
└── *.old-tar/              # архив до перехода на git-поток (можно удалить)
```

**Обновление всех сервисов одной командой:**

```bash
bash ~/resto/src/scripts/update.sh            # pull → build → restart
bash ~/resto/src/scripts/update.sh --no-restart  # только сборка
```

Работающие сервисы:
- `template-app-1` (u-mamy) — :3000, БД `resto`
- `buxara-app-1` — :3001, БД `buxara`, content volume
- `platform-platform-1` — :3100, БД `platform`
- `template-db-1` — общий PostgreSQL (базы разделены по сайтам)
- Caddy :80 — маршрутизация по Host (LAN-режим, без реального TLS)

Cron на хосте:
- `0 */6 * * *` — POST /api/jobs/report-metrics на сайтах (метрики → платформа)
- `*/15 * * * *` — POST /api/jobs/sync-menu на сайтах; фактический запуск дополнительно
  ограничен `intervalMinutes` ресторана
- `*/5 * * * *` — `scripts/process-exports.sh` (запросы экспорта и TTL 24 часа)
- `04:30` — POST /api/jobs/billing-daily на платформе (списания, уведомления)
- `05:00` — `scripts/backup.sh`

Tenant-джобы устанавливает `install-site-jobs.sh`: секрет читается runner-ом
из env-файла с правами 600 и не попадает в crontab/argv. Хостовый обработчик
экспортов устанавливает `install-platform-jobs.sh`. `deploy.sh` и `update.sh`
вызывают оба установщика автоматически.

На dev-ВМ tenant-джобы buxara (report-metrics, sync-menu) идут через
`run-site-job.sh` с секретом из `sites/buxara/.env` (600). Синхронизация buxara
включена: placeSlug `chajxana_buxara_xalyal`, `intervalMinutes` 60.

⚠️ Перед включением sync на сайте, наполненным инжестом ДО этапа ТЗ-1
(ids блюд `dish-<edaId>`, `externalId` пустой, `source='manual'`), применить
`scripts/backfill-yandex-ids.sql` к БД сайта — иначе sync падает с конфликтом
`Dish_pkey` (upsert по `externalId` не находит блюдо и CREATE бьётся о старый id).

Проверка после обновления:

```bash
crontab -l | grep -E 'resto .* (report-metrics|sync-menu|process-exports)$'
```

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

Для платформы в production обязательны отдельный случайный `SESSION_SECRET`
(не короче 32 байт) и `PLATFORM_ADMIN_PASSWORD`. Fallback сессий на пароль
администратора поддерживается только для совместимости и не является штатной
конфигурацией.

`platform/docker-compose.yml` содержит окружение конкретного сервера и поэтому
не хранится в git. Помимо `DATABASE_URL` и секретов в нём обязательно задать
каталог экспорта и read-only volume:

```yaml
services:
  platform:
    environment:
      SESSION_SECRET: ${SESSION_SECRET}
      EXPORT_DIR: /srv/resto/backups/export
    volumes:
      - /home/ilya/resto/backups/export:/srv/resto/backups/export:ro
```

До запуска создать host-каталог. Он должен быть доступен для чтения
непривилегированному пользователю `app` внутри контейнера; сам volume остаётся
read-only, а скачивание снаружи возможно только через авторизованный API:

```bash
install -d -m 755 ~/resto/backups/export
```

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
bash ~/resto/src/scripts/deploy.sh <slug> [--domain=example.ru]
# deploy.sh сам: выделяет порт (registry.json), создаёт per-site
# пользователя БД с паролем и базу, пишет .env (DATABASE_URL,
# ADMIN_PASSWORD, CRON_SECRET, права 600), поднимает контейнер,
# ставит cron-джобы (install-site-jobs.sh + install-platform-jobs.sh).
```

⚠️ deploy.sh требует собранный `resto-template-migrator:latest` (шаг миграции):
перед первым деплоем после чистки образов выполни `update.sh --no-restart`
или `docker build --target migrator -t resto-template-migrator:latest template/`.

⚠️ deploy.sh НЕ регистрирует сайт в платформе. Для метрик/биллинга добавь
запись вручную: строку `Site` (siteKey — случайный hex) и стартовый `BalanceTransaction`
(тип topup, сумма в копейках, уникальный dedupeKey) в БД `platform`, затем допиши
в `.env` сайта `SITE_KEY=<key>` и `PLATFORM_URL=http://platform:3000`
и пересоздай контейнер (`docker compose up -d` в каталоге сайта).

Контент копируется на сервер в `sites/<slug>/content` (tar+scp), владение —
100:101 (chown через контейнер, см. deploy.sh). Далее seed: **с локальной машины**:

```bash
# DATABASE_URL из sites/<slug>/.env, но хост — IP/имя СЕРВЕРА:
# template-db-1 резолвится только внутри docker-сети (снаружи ENOTFOUND).
DATABASE_URL=postgresql://site_...:<pass>@192.168.88.153:5432/<slug> \
CONTENT_DIR=<путь>/sites/<slug>/content npm run seed
```

Seed пишет PWA-иконки в `content/icons` каталога `CONTENT_DIR` (локально при
удалённом seed) — скопируй их на сервер и выставь владение 100:101.
Перед seed выполняется content-readiness: draft-заглушки (DRAFT_, @example.ru,
70000000000) и отсутствующие изображения отклоняются до записи в БД.

После первого деплоя на dev-ВМ сайт доступен по `http://<IP>:<порт>` и через
Caddy `http://<slug>.resto.local` (маршрут добавляет sync-caddy.sh по cron */5).

Изоляция БД: у каждого сайта свой пользователь `site_<slug>` и своя база —
один сайт не читает чужие данные. Пароль общего суперпользователя —
только в env postgres-контейнера, порт 5432 на проде наружу не публикуем.

## Бэкапы и экспорт

- Автомат: `backup.sh` по cron (дампы БД + content, 14 последних).
- Экспорт для клиента: запрос создаётся в кабинете, `process-exports.sh`
  формирует tar.gz в `backups/export/`, а платформа отдаёт его только владельцу.
- В `Site.exportReadyPath` хранится только имя файла, не абсолютный host-путь.
  Старые записи с абсолютным путём очищаются воркером и требуют нового запроса.
- Архивы доступны 24 часа, затем файл и состояние ссылки удаляются; частичные
  архивы старше часа также очищаются. Воркер защищён `flock` от двойного запуска.
- Smoke-check: запросить экспорт, дождаться cron, скачать файл из кабинета и
  убедиться, что внутри есть `content/` и `database.sql`.
