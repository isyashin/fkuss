# Платформа владельца Fkuss

Кабинет владельца ресторанных сайтов: баланс, счета, метрики и экспорт.

## Локальный запуск

1. Скопировать `.env.example` в `.env` и заменить значения-заглушки.
2. Создать базу PostgreSQL `platform` и применить миграции.
3. Установить зависимости, собрать тестовые данные и запустить сервер:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npx tsx scripts/seed-test.ts
npm run dev -- -p 3100
```

Кабинет откроется по адресу <http://localhost:3100/cabinet>.

## Проверка

```bash
npm test
npm run lint
npm run build
npx playwright test
```

Для E2E нужна отдельная тестовая база в `PLATFORM_DATABASE_URL`. Не направляйте
тесты в рабочую базу.

Серверная конфигурация и развёртывание описаны в `../docs/DEPLOY.md`.
