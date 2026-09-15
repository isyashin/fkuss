#!/usr/bin/env bash
# export-site.sh — экспорт сайта для клиента: content + дамп БД → архив.
# Использование: export-site.sh <slug>
set -euo pipefail

SLUG="${1:?Использование: export-site.sh <slug>}"
BASE="${RESTO_BASE:-$HOME/resto}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
SITE_DIR="$BASE/sites/$SLUG"
OUT="$BASE/backups/export/$SLUG-$(date +%Y%m%d-%H%M).tar.gz"
mkdir -p "$(dirname "$OUT")"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cp -r "$SITE_DIR/content" "$TMP/content"
docker exec -i "$DB_CONTAINER" pg_dump -U resto "$SLUG" > "$TMP/database.sql"
tar -czf "$OUT" -C "$TMP" .

echo "✓ Экспорт: $OUT"
echo "  Отдайте ссылку/файл клиенту; удалите через 24 часа (или настройте cron)."
