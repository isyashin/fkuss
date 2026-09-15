#!/usr/bin/env bash
# backup.sh — бэкап всех тенантов: дамп БД + content (в т.ч. images).
set -euo pipefail

BASE="${RESTO_BASE:-$HOME/resto}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
BACKUP_DIR="$BASE/backups/$(date +%Y-%m-%d_%H-%M)"
mkdir -p "$BACKUP_DIR"

# Список баз = директории сайтов
for site_dir in "$BASE"/sites/*/; do
  slug=$(basename "$site_dir")
  echo "→ $slug"
  docker exec -i "$DB_CONTAINER" pg_dump -U resto "$slug" | gzip > "$BACKUP_DIR/$slug.sql.gz" || echo "  ! БД $slug недоступна"
  tar -czf "$BACKUP_DIR/$slug-content.tar.gz" -C "$site_dir" content 2>/dev/null || echo "  ! content $slug пропущен"
done

# Храним последние 14 бэкапов
ls -dt "$BASE"/backups/*/ | tail -n +15 | xargs -r rm -rf

echo "✓ Бэкап: $BACKUP_DIR"
