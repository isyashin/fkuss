# Runbook деплоя нового сайта (fkuss)

> **Автоматизировано:** шаги 1–7 выполняет `scripts/provision-site.sh`
> (сервер, один вызов: `provision-site.sh <slug> <content.tar.gz>`).
> Этот runbook — fallback для отладки и эталонная последовательность.

Проверенная на четырёх сайтах последовательность: buxara → ochag-grill →
aliya → pizza24. Выполняется с локальной Windows-машины; доступ к проду —
по ключу из `secrets/prod.env` (SSH_HOST/SSH_PORT/SSH_USER/SSH_KEY).
Подробности механики: `docs/DEPLOY.md`. Значения секретов никогда не
выводить в логи и не класть в argv команд.

## Шаг 0. Инвентаризация (перед первым деплоем)

Убедись на сервере: `resto-template:latest` и `resto-template-migrator:latest`
собраны, контейнер БД называется `template-db-1`, `~/resto/src` — checkout
main. Для НОВОГО сайта этого достаточно — скрипты обновятся из git.

## Шаг 1. deploy.sh

```bash
ssh $PROD "cd ~/resto/src && git pull --ff-only && bash ~/resto/src/scripts/deploy.sh <slug>"
```

Скрипт сам: выделяет порт (registry.json), создаёт БД `site_<slug>`,
пишет `~/resto/sites/<slug>/.env` (DATABASE_URL, ADMIN_PASSWORD, CRON_SECRET),
применяет миграции и поднимает контейнер `<slug>-app-1`. В выводе запомни
порт. Миграции применяет образ migrator какого он состояния — новая БД
останется на его уровне, это нормально (все сайты на одном образе).

## Шаг 2. Контент на сервер

```bash
tar -czf content.tar.gz -C sites/<slug> content
scp content.tar.gz $PROD:/tmp/
ssh $PROD "cd ~/resto/sites/<slug> && tar -xzf /tmp/content.tar.gz"
```

- Ошибка tar `Cannot utime: Operation not permitted` на bind-mount —
  безобидна, файлы распакованы; `rm /tmp/content.tar.gz` выполни отдельно
  (при `&&`-цепочке после ненулевого tar не выполнится).
- Владение volume (uid 100:101) почини через контейнер:
  `docker run -d --user root -v ~/resto/sites/<slug>:/s resto-template:latest chown -R 100:101 /s/content` (+ `docker wait`, `docker rm`).

## Шаг 3. Seed по SSH-туннелю

`template-db-1` резолвится только внутри docker-сети — seed делаем с
локальной машины через туннель, подменив хост:

```bash
# пароль БД — из ~/resto/sites/<slug>/.env, захватываем молча:
DBURL=$(ssh $PROD "grep '^DATABASE_URL=' ~/resto/sites/<slug>/.env | cut -d= -f2-")
LOCALURL=${DBURL/@template-db-1:5432/@127.0.0.1:55432}

ssh -N -L 127.0.0.1:55432:127.0.0.1:5432 $PROD &   # туннель
CONTENT_DIR=../sites/<slug>/content DATABASE_URL=$LOCALURL npm run seed
kill %1
```

- Без подмены хоста — `P2028: Unable to start a transaction` (DNS-фейл
  маскируется под таймаут транзакции).
- Seed пишет PWA-иконки в ЛОКАЛЬНЫЙ `content/icons` — верни их на сервер
  (tar/scp, шаг 2 повторно только для icons) и повтори chown.

## Шаг 4. Удалённые скрипты: scp + bash, никаких пайпов

Пайп `Get-Content | ssh bash -s` с stdin обрывает сессию до конца скрипта,
BOM портит первую строку, CRLF ломает heredoc-терминаторы, а многоуровневое
экранирование PowerShell→ssh→bash→psql систематически ломает SQL.

Стандарт:

```powershell
# скрипт пишем в файл (write-инструментом, LF-переводы строк)
# при генерации из PowerShell: ($s -replace "`r`n","`n")
scp script.sh $PROD:/tmp/script.sh
ssh $PROD "bash /tmp/script.sh; rm -f /tmp/script.sh"
```

- Удалённый bash-скрипт: LF-only, без BOM, секреты — через temp env-файлы
  (`install -m 600 /dev/null /tmp/x.env; printf ... > /tmp/x.env`), не argv,
  удалить в конце. В `tsx -e` экранируй `$` как `\$`.
- psql с кавычками: только из файла-скрипта, не через `ssh "..."`.

## Шаг 5. Первый владелец админки

```bash
# env-файлы: DATABASE_URL (из .env сайта) + ADMIN_BOOTSTRAP_LOGIN/NAME/PASSWORD
docker run --rm --network template_default \
  --env-file /tmp/<slug>-db.env --env-file /tmp/<slug>-bootstrap.env \
  resto-template-migrator:latest node_modules/.bin/tsx scripts/bootstrap-admin.ts
```

- Пароль генерируй `openssl rand -hex 15` на сервере (30 символов).
  Самодельные генераторы дают сюрпризы (автор runbook получил 16 символов
  вместо 24, каждый ровно один раз).
- Повторный запуск при существующей учётке запрещён.
- Проверка входа программно (`tsx -e` с `authenticateAdmin` в том же
  образе, пароль через env-файл). Если пароль слабый — ротация:
  `hashAdminPassword` + `adminUser.update`.

## Шаг 6. Регистрация в платформе

```sql
-- в БД platform (dedupeKey защищает от повторов)
INSERT INTO "Site" (slug, name, port, domains, state, "siteKey", "tariffId", "imageVersion", "stateChangedAt", "createdAt")
VALUES ('<slug>', '<Имя>', <порт>, '{}', 'active', '<siteKey hex 32>', (SELECT id FROM "Tariff" WHERE name='Стандарт' LIMIT 1), '', now(), now());
INSERT INTO "BalanceTransaction" (id, "siteId", type, amount, "dedupeKey", comment, "createdAt")
VALUES (gen_random_uuid()::text, '<slug>', 'topup', 300000, 'topup:<slug>:initial', 'Стартовое пополнение при подключении', now());
```

Затем в `~/resto/sites/<slug>/.env` добавить `SITE_KEY=<siteKey>` и
`PLATFORM_URL=http://platform:3000`, после чего `docker compose up -d` в
каталоге сайта (пересоздаст контейнер с новым env).

## Шаг 7. Caddy: сначала диагностика, потом маршрут

`sync-caddy.sh` строит блоки из БД платформы и падает с «ambiguous site
definition», если живой Caddyfile ручной (на проде было именно так — крон
фейлился давно). Перед синком:

```bash
grep -c 'resto-site-begin' /etc/caddy/Caddyfile   # 0 = ручной конфиг
```

- Маркеры есть → `sudo sync-caddy.sh` сам всё сделает.
- Маркеров нет → добавь блок вручную в стиле соседей:
  `<slug>.fkuss.ru { reverse_proxy localhost:<порт> }`,
  затем `caddy validate` и `systemctl reload caddy` (validate сначала —
  reload без него не делать).

## Шаг 8. Git: только PR, точечно

main защищён (PR + status checks). Рабочая ветка обычно расходится с main —
НЕ делай `git rebase origin/main` из неё: потянет десятки чужих коммитов
в конфликты. Стандарт:

```bash
git checkout -b docs/<slug>-plan origin/main
git cherry-pick <коммит с PLAN.md>
git push origin docs/<slug>-plan
gh pr create --base main --head docs/<slug>-plan
```

## Шаг 9. Финальная приёмка

По `acceptance.md`: HTTPS 200, canonical/QR на tenant, тестовый заказ
(изоляция сверяется count'ом в соседней БД, потом отменить), вход владельца
проверен, PWA-иконки 200, скриншоты на 360px и десктопе без горизонтального
скролла и JS-ошибок (Playwright: `viewport {width:360}` →
`document.documentElement.scrollWidth > innerWidth`).

## Типовые грабли (кратко)

| Симптом | Причина | Решение |
|---|---|---|
| `P2028` при seed | хост `template-db-1` не резолвится снаружи | подмена на 127.0.0.1 через туннель (шаг 3) |
| скрипт оборвался после 1–2 строк | пайп в stdin ssh | scp + `bash /путь` (шаг 4) |
| heredoc съел хвост скрипта | CRLF в терминаторе | LF-only файл (шаг 4) |
| psql «extra command-line argument» | квотинг через ssh | только из файла-скрипта (шаг 4) |
| tar `Cannot utime` | права на bind-mount | безобидно; chown через контейнер (шаг 2) |
| 400 «Проверьте поля заказа» | `preferredChannel` объектом | строка или `null` |
| «ambiguous site definition» | ручной Caddyfile + sync-caddy | ручной блок (шаг 7) |
| push rejected | main защищён | PR из ветки (шаг 8) |
