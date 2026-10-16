# Эксплуатация с явной топологией

Этот режим поддерживает отдельные контейнеры PostgreSQL нового dev. Старые
скрипты для общего PostgreSQL продолжают работать без `RESTO_TOPOLOGY`.
**Не запускать старый `update.sh` с его дефолтами на новой раскладке.**

## Конфиг

Сохранить JSON вне git, например `<operations>/topology.json` (600). Значений
паролей, site key и токенов в нём нет: только пути к существующим env-файлам.
Пример структуры; заменить все пути, имена контейнеров, домены и адрес владельца
на фактические. Порты и домены уникальны. `dbName`/`dbUser` можно опустить, когда
они совпадают с POSTGRES_DB/POSTGRES_USER контейнера.

```json
{
  "version": 1,
  "operatorUser": "operator",
  "baseDir": "/srv/fkuss-operations",
  "sourceDir": "/srv/fkuss-main",
  "templateMigratorImage": "resto-template-migrator:release-SHA",
  "platform": {
    "composeDir": "/srv/deploy/platform", "composeFiles": ["compose.yml"],
    "envFile": "/srv/deploy/platform/.env", "appContainer": "platform-app-1",
    "dbContainer": "platform-db-1", "port": 3100,
    "domains": ["platform.example.test"], "publicUrl": "https://platform.example.test"
  },
  "tariff": { "id": "standard", "name": "Стандарт", "monthlyPrice": 3000, "initialKopecks": 300000 },
  "sites": [{
    "slug": "restaurant", "name": "Ресторан", "port": 8101,
    "domains": ["restaurant.example.test"], "ownerEmail": "owner@example.test",
    "composeDir": "/srv/deploy/restaurant", "composeFiles": ["compose.yml"],
    "envFile": "/srv/deploy/restaurant/.env", "contentDir": "/srv/sites/restaurant/content",
    "appContainer": "restaurant-app-1", "dbContainer": "restaurant-db-1",
    "dbNetwork": "restaurant_default"
  }]
}
```

`initialKopecks` — однократный согласованный стартовый баланс. Повторная
регистрация защищена уникальным ключом ledger; существующий тариф/баланс не
пересчитывается. Для dev допустим отдельный тестовый тариф. Настоящие email и
предметные данные задаёт оператор в конфиге, код их не содержит.

## Подготовка и последовательное обновление

1. Сверить `git status`, `origin/main`, SHA, Docker/DB/content/env всех сервисов.
   Использовать собственный detached checkout **main после мержа**. Сохранить
   старые compose/env, digest работающих образов и откатные теги. Не переключать
   чужой checkout и не запускать `seed` на наполненных сайтах.
   В каждом приватном `envFile` мигратора нужен полный `DATABASE_URL` для его
   DB-сети. Старый compose может собирать его из `DB_PASSWORD`, поэтому одного
   `--env-file` недостаточно: проверить наличие переменной без вывода значения,
   сверить DB/user/hostname и сохранить действующее подключение из runtime в env.
   Не передавать пароль/URL через argv или публичные логи. После сборки проверить
   свободное место для rollout и backup; cache prune не должен удалять образы
   отката, контейнеры или volumes.
2. `python3 scripts/topology.py <config> check` — проверка конфига без записи.
   `sudo python3 scripts/topology.py <config> backup --apply` — атомарно публикует
   snapshot только после успешного дампа всех DB и копирования всего content.
   Внутри: custom-format `.dump`, `*-content.tar.gz`, приватные `*.env`, manifest,
   `topology.json`, Caddyfile и исходные compose/служебные/image overrides.
   Snapshot 700, env/dump 600. Ротация только собственных `release-*`, 14 штук.
3. Собрать template/platform runner и migrator из зафиксированного main с
   immutable тегом `release-<SHA>` и OCI `org.opencontainers.image.revision`.
   Не заменять работающие образы до завершения миграций и проверки кандидата.
4. Особый F01: `reconcile-preorder --slug <affected> --apply` разрешён **только**
   для отсутствующей истории 0013, точного физического DDL трёх nullable TEXT
   колонок без default, полных совпадающих checksum предыдущих миграций и
   неизменённого SQL 0013. Сначала автоматически снимается backup. Другие
   несоответствия останавливают операцию; `db push` и повторный `ALTER` запрещены.
   Затем штатный `migrate deploy` дважды, `migrate status`, сверка бизнес-данных.
5. `sudo python3 scripts/topology.py <config> register --apply` регистрирует
   сайты/владельцев/домен в платформе и сохраняет уникальные site key в env.
   Сохраняет старый env как `.env.before-topology`. Создаёт **отдельную внутреннюю
   служебную сеть на каждый сайт**: только его app и app платформы; DB в ней нет.
   `fkuss-services.json` — compose override с сетями и read-only export volume.
   Этот шаг сам приложения не перезапускает. Проверить состав каждого override.
6. Для каждого сервиса по одному: migrator в его DB-сети с его `--env-file`,
   затем `docker compose` со всеми исходными `-f`, `fkuss-services.json` и override
   immutable image → `up -d app` → health/HTTP/perf/ключевые CJM. Платформа перед
   tenant rollout должна пройти аддитивную миграцию 0005. Миграции не удаляют
   бизнес-данные; откат образа не должен откатывать DB разрушительными командами.
7. Проверить сеть в обе стороны: tenant → `/api/sites/me`, report-metrics →
   собственная строка Site; platform → `/api/sites/owner-pin` правильного tenant.
   Неверный site key должен давать отказ, а DB другого ресторана — не состоять
   в служебной сети. `PLATFORM_PUBLIC_URL` не заменяет `PLATFORM_URL`.

## Caddy и задания

Сначала сравнить домены/алиасы в БД и Caddy. Однократно:
`sudo python3 scripts/topology.py <config> adopt-caddy --apply`.
Команда удаляет только явно перечисленные блоки ресторанов; неизвестный алиас
в смешанном блоке вызывает отказ. Платформа, QA-домены и посторонние блоки
сохраняются. Кандидат проверяется через `caddy validate` до замены, reload при
сбое восстанавливает предыдущий конфиг. Дальше используется `caddy --apply`;
ручную правку управляемых блоков заменит следующий запуск. Все домены/алиасы
сайта получают одинаковую active/grace/suspended маршрутизацию.

`sudo python3 scripts/install-topology-jobs.py <config>` устанавливает
`/etc/cron.d/fkuss-topology`: по три job каждого сайта (metrics 6 ч, sync 15 мин,
push 1 мин), billing 04:30, backup 05:00, exports 5 мин, Caddy 1 мин. Убирает
только известные старые job этих сайтов из `operatorUser` cron. Другие строки
не меняет. Логи приватные, logrotate 14 дней. HTTP runner читает CRON_SECRET
из env через временный curl config, секрет не попадает в argv или логи.
После установки запустить каждую job вручную и проверить не только exit code,
но и фактический результат в БД/файлах/HTTP. Не считать установленный cron
доказательством работоспособности.

## Экспорт и восстановление

`exports --apply` обрабатывает запросы под flock; архив content + SQL публикуется
атомарно. CAS по `exportRequestedAt` не отдаёт результат старого запроса новому.
Срок 24 ч отсчитывается от готовности (`exportReadyAt`, `exportExpiresAt`),
проверяется независимо в API/UI; cleanup только освобождает место. Read-only
volume `/app/exports`, файлы 640 и UID/GID app, download owner-only + O_NOFOLLOW.

Для приёмки восстановить **в отдельные QA-базы**: `pg_restore --no-owner` из
custom dump; content распаковать в новый каталог, сравнить SHA256 всех файлов,
агрегаты/канонические хеши бизнес-таблиц, фото, два меню и Settings. Не заливать
restore поверх живого сайта ради теста. Запустить копию с собственными ключами,
запрещёнными внешними каналами и отдельными учётками. DB-dump консистентен внутри
каждой DB; DB и файловая система не образуют общую транзакцию. Для гарантированной
точки восстановления перед релизом прекратить редактирование/загрузки на время
snapshot, после restore сверить ссылки на все медиа.

Отдельно проверить manual pause → billing/topup → всё ещё suspended → Caddy 503
на каждом алиасе → явная реактивация → 200. Финансовая suspended снимается по
балансу. Отмена/возвраты ресторанных заказов в этот релиз не входят по решению
пользователя от 16.10.2026.
