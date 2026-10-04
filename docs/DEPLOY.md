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

### Релиз v1.2 на проде (2026-09-30, e690ec0, тег `v1.2`)

Прод-VPS переведён с ветки v0.1-эпохи на релиз v1.2: новая админка
ресторана (owner/staff + PIN-гейт, звук событий с повторами, табы меню
с драгом/колесом), кабинет гостя, платформа (биллинг, PIN-панель,
метрики). Порядок: мерж PR №10 и №11 → тег `v1.2` → `update.sh`
(pull → build → миграции → restart → cron). До обновления снят бэкап
(`backups/2026-09-30_11-04-19`), образы перетегированы в
`resto-template:v1.1-rollback` и `platform-platform:v1.1-rollback`.

- Сайты `buxara` (:3001), `ochag-grill` (:3002), `aliya` (:3003) и
  платформа (:3100) работают на `resto-template:latest` /
  `platform-platform` из `main`; миграции применены до `0008_admin_event_tab`
  (сайты) и `0004_notify_channel` (платформа). Backfill внешних id
  Яндекс.Еды не потребовался (пустых `externalId` нет ни в одной БД).
- Owner-аккаунты (логин `owner`) созданы через
  `scripts/bootstrap-admin.ts` (migrator-образ) на всех трёх сайтах;
  пароли выданы владельцу отдельно. Старый `ADMIN_PASSWORD` из env
  новой админкой не используется.
- **Личный кабинет гостя** (PR №15, 2026-09-30): переключатель в настройках
  админки (карточка «Личный кабинет гостя»), по умолчанию выключен.
  На трёх сайтах проде кабинет включён в режиме «код на экране» (без SMTP).
  Env-флаг `AUTH_DEV_CODE` из site-.env удалён — показ кода на экране
  теперь только через настройку (`authMode: "screen"`); безопасный дефолт
  `authMode: "email"` (код не светится в ответах, пока ресторан явно не
  выберет показ на экране). SMTP для кодов и уведомлений настраивается
  в той же карточке (SMTP URL + From, кнопка тестового письма); при пустых
  полях mailer фолбэкается на env `SMTP_URL`/`SMTP_FROM` (dev-Mailpit).
  При выключенном кабинете: заглушка `/account`, скрытая ссылка «Кабинет»,
  чекаут без email и бонусов, auth-API → 403, списание бонусов отклоняется.
- `DEV_GUEST_LOGIN` и `INSECURE_HTTP` на проде отсутствуют.

### Релиз v1.3 на проде (2026-10-04, 874f0c3)

- Сайты `buxara` (:3001), `ochag-grill` (:3002), `aliya` (:3003) обновлены
  до v1.3 через `update.sh`: миграция `0010_multi_menu` применена ко всем БД
  (аддитивная), сайты без групп меню ведут себя как раньше (переключатель
  скрыт). Плюс фикс кэша CSS (зум 1.2, `no-cache` для HTML).
- **Четвёртый сайт — `pizza24`** (:3004, pizza24.fkuss.ru) — развёрнут
  параллельной сессией на этом же релизе.
- **Пятый сайт — `batono`** (:3005, **batono.fkuss.ru**) — кейс «несколько
  меню» (docs/CASE-MULTI-MENU.md): две группы меню («Хинкальная» +
  «Пироги и пицца») с заведений `batono_w98td` и `picceriya__1`, 18 категорий
  / 120 блюд, общая корзина, в админке бейджи групп и сводка в заказе.
  Sync: `sync.sources` оба источника. ЛК гостя выключен (решение владельца).
  Контакты — заглушки, владелец заменит через админку.
  Владелец админки: логин `owner` (пароль выдан отдельно).
  В платформе: тариф «Стандарт», стартовое пополнение 3000 ₽.
- Caddy: маршрут `batono.fkuss.ru` добавлен через admin-API (:2019);
  **сниппет для постоянного Caddyfile** лежит на сервере в
  `~/resto/caddy-batono.snippet` — при наличии sudo добавить в
  `/etc/caddy/Caddyfile` и `systemctl reload caddy` (иначе маршрут
  потеряется при рестарте Caddy).
- Откат: теги `resto-template:v1.3-rollback` / `platform-platform:v1.3-rollback`;
  бэкап `backups/2026-10-04_20-53-07`.
- Проверка после релиза: три старых сайта 16/16 (витрина/гость/заказ/
  кабинет/админка), batono 11/11 (мультименю-сценарии), perf-smoke 5/5.
- Проверка после релиза: perf-smoke тёплый — в норме (≤500 мс);
  HTTPS-прогон 16/16 (витрина, вход гостя с кодом с экрана, заказ
  самовывоза, кабинет с бонусами, админка со статусами до «выдан»,
  платформа). Откат при проблемах: три compose на
  `resto-template:v1.1-rollback` + `up -d`.

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
- `buxara-app-1` — :3001, БД `buxara`, content volume, образ пинается в
  `sites/buxara/admin-pr10.override.yml` (тег `resto-template:work-*`)
- `ochag-grill-app-1` — :3003, БД `ochag-grill`, content volume, override как у buxara
- `template-app-1` (u-mamy) — :3000, БД `resto`, прежний образ
- `buxara-app-1` — :3001, БД `buxara`, content volume, `resto-template:admin-pr10-130355a`
- `ochag-grill-app-1` — :3003, БД `ochag-grill`, content volume, `resto-template:admin-pr10-130355a`
- `platform-platform-1` — :3100, БД `platform`
- `template-db-1` — общий PostgreSQL (базы разделены по сайтам)
- Caddy :80 — маршрутизация по Host (LAN-режим, без реального TLS)

В compose платформы (`src/platform/docker-compose.yml`, не в git) на общей
сети обязан быть alias `platform` — сайты ходят на платформу по
`PLATFORM_URL=http://platform:3000` (биллинг в админке, `/api/sites/me`,
`/api/sites/owner-pin`). Без alias DNS внутри сети не резолвится и вызовы
висят по 5–10 с (каждое открытие «Настроек» ждёт таймаут). Проверка с сайта:
`docker exec buxara-app-1 getent hosts platform`.

Скорость отклика — постоянный критерий приёмки: `bash scripts/perf-smoke.sh <порт>`
после деплоя (порог TTFB 500 мс для `/`, `/booking`, `/account`, `/admin`).

Код сайтов живёт в `admin-pr10-checkout` (ветка `codex/ui-fix-recovery`);
образы собираются оттуда, теги `resto-template:work-*` / `platform-platform`.
Образ `130355a` собран из отдельного `/home/ilya/resto/admin-pr10-checkout`
после зелёного CI PR № 10. Переопределения двух сайтов находятся в
`sites/{ochag-grill,buxara}/admin-pr10.override.yml`; копии предыдущего
варианта сохранены рядом с суффиксом `.rollback-761de83`. Основной checkout
`src` и работающие сервисы «У мамы» и платформы не переключались.

Cron на хосте:
- `0 */6 * * *` — POST /api/jobs/report-metrics на сайтах (метрики → платформа)
- `*/15 * * * *` — POST /api/jobs/sync-menu на сайтах; фактический запуск дополнительно
  ограничен `intervalMinutes` ресторана. Источники меню — `settings.sync.sources`
  (`[{placeSlug, menuId}]`, по источнику на группу меню; легаси `sync.placeSlug` —
  fallback). Мультименю: см. `docs/CASE-MULTI-MENU.md`.
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

После контролируемого переключения 2026-09-25 «Бухара» и «Очаг гриль» запущены
с отдельным compose override `admin-pr10.override.yml` на закреплённом образе
`resto-template:admin-pr10-1f5d932` (первый визуальный срез PR № 10);
их БД мигрированы до `0007`. Задания
report-metrics и sync-menu для обоих сайтов работают. Демо «У мамы» сохранено
на прежнем образе и схеме. Рабочий checkout `~/resto/src` остался на `main`;
код новой версии находится в отдельном `~/resto/admin-pr10-checkout`.
После зелёного CI первого визуального среза обновлены только compose override
и app-контейнеры `buxara` и `ochag-grill`; checkout `~/resto/src`, схема БД,
демо «У мамы» и платформа не менялись. Предыдущий образ и копии override
сохранены для отката. Оба сайта и страницы входа админки отвечают HTTP 200;
визуальная приёмка остальных разделов прототипа продолжается.
`scripts/update.sh` до общего обновления всех сайтов применять нельзя: он
затронет демо-сайт и снимет выбор закреплённого образа в обычном compose.

На dev оба сайта подключены к внутреннему Mailpit по `SMTP_URL` через
`admin-pr10.override.yml`. SMTP-порт 1025 доступен только в Docker-сети;
web-интерфейс Mailpit привязан к `127.0.0.1:8025` самой ВМ и не опубликован
через Caddy. Письма хранятся в Docker volume `admin-pr10-mailpit-data`, не в
Git. Гостевой OTP с обоих публичных адресов проверен до входа в кабинет;
код в HTTP-ответ не попадает, `AUTH_DEV_CODE` выключен. Отправка уведомлений
о тестовых заказах и бронях подтверждена в Mailpit; после теста каналы
выключены обратно. Это доставка в локальную песочницу, не во внешний ящик.
Для prod нужно заменить `SMTP_URL`/`SMTP_FROM` на реальный SMTP, включить
нужные каналы после настройки адреса или чата и проверить внешнюю доставку.

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
платформы. На проде с HTTPS флаг НЕ ставить. deploy.sh его не пишет —
после деплоя на dev-LAN добавь в `.env` сайта вручную (сайт: админка и
кабинет гостей; платформа: кабинеты владельцев).

## Где живёт биллинг

Баланс/счета за сам сайт — в кабинете платформы (`/cabinet`), не в админке
ресторана. В шапке админки ресторана есть ссылка «Баланс и подписка →»
(env сайта `PLATFORM_PUBLIC_URL`).

## Деплой нового сайта

```bash
bash ~/resto/src/scripts/deploy.sh <slug> [--domain=example.ru]
# deploy.sh сам: выделяет порт (registry.json), создаёт per-site
# пользователя БД с паролем и базу, пишет .env (DATABASE_URL,
# ADMIN_PASSWORD для прежней версии, CRON_SECRET, права 600), поднимает контейнер,
# ставит cron-джобы (install-site-jobs.sh + install-platform-jobs.sh).
```

⚠️ deploy.sh требует собранный `resto-template-migrator:latest` (шаг миграции).
Собери его отдельно: `docker build --target migrator -t resto-template-migrator:latest template/`.
`update.sh --no-restart` не подходит для обновления со старых статусов заказов:
он мигрирует БД, пока старый код ещё принимает записи.

### Первый владелец новой админки

После миграций до `0007_guest_contact`, до запуска нового кода, создай первого
владельца в каждой ресторанной БД отдельно. Команда `bootstrap-admin.ts`
принимает `DATABASE_URL`, `ADMIN_BOOTSTRAP_LOGIN`, `ADMIN_BOOTSTRAP_NAME` и
`ADMIN_BOOTSTRAP_PASSWORD` из закрытых env-файлов. Повторный запуск при наличии
учётной записи запрещён. Пароль не передавай аргументом командной строки и не
выводи в журнал; после создания владельца удали временный bootstrap env-файл.

```bash
docker run --rm --network template_default \
  --env-file /закрытый/путь/db.env \
  --env-file /закрытый/путь/admin-bootstrap.env \
  resto-template-migrator:latest \
  node_modules/.bin/tsx scripts/bootstrap-admin.ts
```

В новой версии `ADMIN_PASSWORD` не используется для входа. Учётки и сессии
живут в БД конкретного ресторана; при переносе на prod задаются новые
доступы через bootstrap или раздел «Сотрудники», без изменения кода.

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
