# DEPLOY.md — сервер, домены, деплой, бэкапы

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
6. Крон-джобы (метрики/биллинг/бэкап) по образцу dev-ВМ
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
