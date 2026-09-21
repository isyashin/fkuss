#!/usr/bin/env bash
# test-with-db.sh — одноразовый PostgreSQL для интеграционных тестов.
# Поднимает одноразовый postgres:17-alpine на свободном порту, применяет миграции,
# гоняет vitest и удаляет только созданный этим запуском контейнер.
# Использование: bash scripts/test-with-db.sh
set -euo pipefail

cd "$(dirname "$0")/.."
CONTAINER="${TEST_DB_CONTAINER:-resto-test-db-$$}"
started=0

cleanup() {
  if [ "$started" -eq 1 ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Ошибка: контейнер '$CONTAINER' уже существует; укажите другой TEST_DB_CONTAINER." >&2
  exit 1
fi

docker run -d --name "$CONTAINER" -p 127.0.0.1::5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test \
  postgres:17-alpine >/dev/null
started=1

PORT="$(docker port "$CONTAINER" 5432/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')"
if [ -z "$PORT" ]; then
  echo "Ошибка: не удалось определить опубликованный порт контейнера '$CONTAINER'." >&2
  exit 1
fi
export DATABASE_URL="postgresql://test:test@127.0.0.1:${PORT}/test"

echo "== жду postgres =="
ready=0
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U test -d test >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "Ошибка: postgres не готов за 30 секунд (контейнер '$CONTAINER')." >&2
  docker logs "$CONTAINER" >&2 || true
  exit 1
fi

echo "== миграции =="
npx prisma generate
npx prisma migrate deploy

echo "== vitest =="
npm test
