#!/usr/bin/env bash
# export-site.sh — экспорт сайта для клиента: content + дамп БД → архив.
# Использование: export-site.sh <slug>
set -euo pipefail

SLUG="${1:?Использование: export-site.sh <slug>}"
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Некорректный slug" >&2
  exit 1
fi
BASE="${RESTO_BASE:-$HOME/resto}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
SITE_DIR="$BASE/sites/$SLUG"
OUT="$BASE/backups/export/$SLUG-$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p "$(dirname "$OUT")"
ARCHIVE_TMP="${OUT}.partial.$$"

[ -d "$SITE_DIR/content" ] || { echo "Нет content сайта $SLUG" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"; rm -f "$ARCHIVE_TMP"' EXIT

cp -r "$SITE_DIR/content" "$TMP/content"
docker exec -i "$DB_CONTAINER" pg_dump -U resto "$SLUG" > "$TMP/database.sql"
tar -czf "$ARCHIVE_TMP" -C "$TMP" .
mv -- "$ARCHIVE_TMP" "$OUT"
chmod 0644 "$OUT"

echo "✓ Экспорт: $OUT"
echo "EXPORT_PATH=$OUT"
echo "  Отдайте ссылку/файл клиенту; удалите через 24 часа (или настройте cron)."
