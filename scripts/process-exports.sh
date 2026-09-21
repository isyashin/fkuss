#!/usr/bin/env bash
# process-exports.sh — обработка запросов экспорта сайтов.
# Запуск по cron на хосте: bash ~/resto/src/scripts/process-exports.sh
set -euo pipefail

BASE="${RESTO_BASE:-$HOME/resto}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"

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
    docker exec -i "$DB_CONTAINER" psql -U resto platform \
      --set=slug="$slug" --set=ready_path="$OUT" <<'SQL'
UPDATE "Site"
SET "exportReadyPath" = :'ready_path'
WHERE slug = :'slug';
SQL
    echo "✓ готов: $OUT"
  else
    echo "✗ экспорт не удался для $slug"
  fi
done <<< "$REQUESTS"
