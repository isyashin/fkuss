#!/usr/bin/env bash
# process-exports.sh — обработка запросов экспорта сайтов.
# Запуск по cron на хосте: bash ~/resto/src/scripts/process-exports.sh
set -euo pipefail

BASE="${RESTO_BASE:-$HOME/resto}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"

# Сайты с незакрытым запросом экспорта
REQUESTS=$(docker exec -i "$DB_CONTAINER" psql -U resto platform -Atc \
  "SELECT slug FROM \"Site\" WHERE \"exportRequestedAt\" IS NOT NULL AND \"exportReadyPath\" IS NULL")

for slug in $REQUESTS; do
  echo "→ экспорт $slug"
  OUT=$(bash "$BASE/src/scripts/export-site.sh" "$slug" | grep -oP '(?<=Экспорт: ).*' || true)
  if [ -n "$OUT" ] && [ -f "$OUT" ]; then
    docker exec -i "$DB_CONTAINER" psql -U resto platform -c \
      "UPDATE \"Site\" SET \"exportReadyPath\" = '$OUT' WHERE slug = '$slug'"
    echo "✓ готов: $OUT"
  else
    echo "✗ экспорт не удался для $slug"
  fi
done
