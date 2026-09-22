#!/usr/bin/env bash
# process-exports.sh — обработка запросов экспорта сайтов.
# Запуск по cron на хосте: bash ~/resto/src/scripts/process-exports.sh
set -euo pipefail

BASE="${RESTO_BASE:-$HOME/resto}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
EXPORT_DIR="$BASE/backups/export"
mkdir -p "$EXPORT_DIR"

# Не допускаем параллельную обработку одного и того же запроса двумя cron-процессами.
exec 9>"$BASE/backups/process-exports.lock"
if ! flock -n 9; then
  echo "Обработчик экспортов уже запущен; пропуск"
  exit 0
fi

# Ссылка на экспорт живёт 24 часа; незавершённые архивы чистим через час.
find "$EXPORT_DIR" -maxdepth 1 -type f -name '*.tar.gz' -mmin +1440 -delete
find "$EXPORT_DIR" -maxdepth 1 -type f -name '*.partial.*' -mmin +60 -delete

# Старые абсолютные пути несовместимы с безопасной выдачей. Просроченный запрос
# очищаем целиком, чтобы кабинет не показывал ссылку на уже удалённый файл.
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U resto platform <<'SQL'
UPDATE "Site"
SET "exportRequestedAt" = NULL, "exportReadyPath" = NULL
WHERE "exportReadyPath" IS NOT NULL
  AND (
    "exportRequestedAt" < NOW() - INTERVAL '24 hours'
    OR "exportReadyPath" LIKE '%/%'
    OR "exportReadyPath" LIKE '%\\%'
  );
SQL

# Сайты с незакрытым запросом экспорта
REQUESTS=$(docker exec -i "$DB_CONTAINER" psql -U resto platform -Atc \
  "SELECT slug FROM \"Site\" WHERE \"exportRequestedAt\" IS NOT NULL AND \"exportReadyPath\" IS NULL")

while IFS= read -r slug; do
  [ -z "$slug" ] && continue
  if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "✗ пропущен некорректный slug" >&2
    continue
  fi
  echo "→ экспорт $slug"
  if ! export_output=$(bash "$BASE/src/scripts/export-site.sh" "$slug"); then
    echo "✗ экспорт не удался для $slug" >&2
    continue
  fi
  OUT=$(printf '%s\n' "$export_output" | sed -n 's/^EXPORT_PATH=//p')
  if [ -n "$OUT" ] && [ -f "$OUT" ]; then
    OUT_NAME=$(basename "$OUT")
    docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U resto platform \
      --set=slug="$slug" --set=ready_path="$OUT_NAME" <<'SQL'
UPDATE "Site"
SET "exportReadyPath" = :'ready_path'
WHERE slug = :'slug';
SQL
    echo "✓ готов: $OUT_NAME"
  else
    echo "✗ экспорт не удался для $slug"
  fi
done <<< "$REQUESTS"
