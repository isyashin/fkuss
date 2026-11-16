# Fkuss

White-label платформа сайтов ресторанов: AI-наполняемая витрина, заказы и брони, админка ресторана, доставка, лояльность, PWA/push и SaaS-биллинг. Один шаблон обслуживает изолированные tenant-ы с собственными БД, контентом и настройками.

## Структура репозитория

| Каталог | Назначение |
|---|---|
| `template/` | Next.js-витрина, API и админка ресторана; скрипты seed/импорта |
| `platform/` | Next.js-платформа владельца: сайты, владельцы, метрики, биллинг, экспорт |
| `template/content/` | Демонстрационный контент; рабочий контент tenant-ов хранится отдельно |
| `scripts/` | Серверные скрипты сборки, резервного копирования и эксплуатации |
| `infra/` | Инфраструктурные конфигурации |
| `landing-prototype/` | Отдельный лендинг продукта и его проверки |
| `docs/` | Архитектура, схема контента, эксплуатация, план и QA |
| `test-front/` | Локальный сохраняемый прототип админки; в git не входит |

**Контент отделён от кода.** Агент наполнения изменяет только разрешённый `content/` конкретного сайта. Секреты находятся только в `secrets/` и закрытых env-файлах и не коммитятся.

## Требования

- Node.js 22 и npm — версия Node в CI;
- PostgreSQL 17 для миграций и интеграционных тестов;
- Docker для сборки/проверки образов и серверной эксплуатации;
- Playwright-браузеры для E2E.

## Локальный запуск

Команды выполняются отдельно в `template/` и `platform/`, а не в корне репозитория.

```bash
cd template                 # или platform
npm ci
npx prisma generate
cp .env.example .env        # заполнить только локальные значения
npx prisma migrate deploy
npm run dev
```

Для `template/` дополнительно можно наполнить демонстрационную БД:

```bash
npm run seed
```

Первый владелец создаётся отдельной bootstrap-командой; не используйте пароли из примеров вне локальной среды. Подробности — в `docs/DEPLOY.md` и `template/.env.example`.

Платформа и шаблон — независимые приложения с собственными `package-lock.json`, Prisma Client и БД. Для совместного запуска используйте разные порты; в CI платформа использует 3100.

## Проверки

Из `template/` или `platform/`:

```bash
npx tsc --noEmit
npm test                   # интеграционным тестам нужен DATABASE_URL
npm run lint
npm run build
npx playwright test        # после подготовки тестовой БД и браузеров
```

Серверные Python-тесты из корня:

```bash
python3 -m unittest discover -s scripts/tests -p '*_test.py'
```

Полный эталонный сценарий, включая миграции, seed, bootstrap и E2E, находится в `.github/workflows/test.yml`. Проверки `validate`, `template` и `platform` обязательны для PR.

## Контент и импорт

Формат JSON, readiness-правила и примеры: `docs/CONTENT-SCHEMA.md`. Основные команды из `template/`:

```bash
npx tsx scripts/validate-content.ts <content-dir>
npx tsx scripts/assemble-content.ts --input <manifest> --out <content-dir>
npx tsx scripts/new-content.ts <content-dir> --slug <slug> --name "Название"
```

Не запускайте seed на наполненном ресторане без отдельного согласования и резервной копии.

## Эксплуатация и релизы

Актуальный процесс новой топологии: **`docs/TOPOLOGY-OPERATIONS.md`**.

- Сборка release-образов только из чистого `origin/main`: `scripts/build-release.py`.
- Перед выпуском: snapshot и проверка конфигурации через `scripts/topology.py`.
- Обновление последовательное: миграции → один сервис → health/perf/ключевые сценарии → следующий.
- `scripts/update.sh`, `scripts/deploy.sh` и `scripts/provision-site.sh` без явной топологии относятся к legacy shared-PG. Не запускайте их с настройками по умолчанию на текущем dev.
- Production не обновляется автоматически и требует отдельной явной команды.

Последний задокументированный baseline окружений и ограничения проверок: `docs/PLAN.md` и `docs/qa/2026-11-16-project-audit.md`.

## Документация

| Документ | Содержание |
|---|---|
| `AGENTS.md` | Обязательные правила разработки, git-поток и команды |
| `docs/PLAN.md` | Текущий baseline, этапы и история приёмки |
| `docs/ARCHITECTURE.md` | Архитектура, изоляция tenant-ов и потоки данных |
| `docs/CONTENT-SCHEMA.md` | Схема контента |
| `docs/DEPLOY.md` | Окружения, legacy-развёртывание, домены и резервные копии |
| `docs/TOPOLOGY-OPERATIONS.md` | Канонический процесс новой топологии |
| `docs/PAYMENTS.md` | Платёжные провайдеры |
| `docs/BILLING.md` | Биллинг платформы |
| `docs/CHANNELS.md` | Внешние каналы уведомлений |

## Git-поток

`main` защищён: отдельный worktree и ветка → проверки → PR → три зелёных CI → squash-merge. Для новой задачи используйте `scripts/new-agent-worktree.ps1`. При изменении решения или статуса обновляйте `docs/PLAN.md` в том же коммите. Подробности и правила сохранения локальных прототипов — в `AGENTS.md`.
