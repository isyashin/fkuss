# Шаблон сайта ресторана Fkuss

White-label приложение одного ресторана. Код общий для всех tenants, а данные
конкретного ресторана находятся в отдельном `content/` и собственной базе.

## Локальный запуск

1. Скопировать `.env.example` в `.env` и заменить значения-заглушки.
2. Запустить PostgreSQL и создать базу `resto` либо поднять сервис `db` через
   `docker compose`.
3. Выполнить:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run dev
```

Сайт откроется на <http://localhost:3000>, админка — на
<http://localhost:3000/admin>.

Другой ресторан подключается через `CONTENT_DIR=<путь-к-content>`; runtime и
seed должны получать один и тот же каталог.

## Проверка

```bash
npm test
npm run lint
npm run build
npx playwright test
```

Интеграционные и E2E-тесты требуют отдельную тестовую базу. Не используйте
рабочую `DATABASE_URL`. Формат content описан в `../docs/CONTENT-SCHEMA.md`,
развёртывание — в `../docs/DEPLOY.md`.
