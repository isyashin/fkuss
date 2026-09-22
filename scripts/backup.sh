#!/usr/bin/env bash
# backup.sh — бэкап всех тенантов: дамп БД + content (в т.ч. images).
set -euo pipefail

BASE="${RESTO_BASE:-$HOME/resto}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
BACKUPS_ROOT="$BASE/backups"
BACKUP_DIR="$BACKUPS_ROOT/$(date +%Y-%m-%d_%H-%M-%S)"
mkdir -p "$BACKUPS_ROOT"
[ ! -e "$BACKUP_DIR" ] || BACKUP_DIR="${BACKUP_DIR}-$$"
STAGING=$(mktemp -d "$BACKUPS_ROOT/.partial-XXXXXX")
cleanup() { [ -z "$STAGING" ] || rm -rf -- "$STAGING"; }
trap cleanup EXIT

shopt -s nullglob
site_dirs=("$BASE"/sites/*/)
if [ "${#site_dirs[@]}" -eq 0 ]; then
  echo "Нет сайтов для резервного копирования" >&2
  exit 1
fi

# Список баз = директории сайтов
failed=0
for site_dir in "${site_dirs[@]}"; do
  slug=$(basename "$site_dir")
  echo "→ $slug"
  if ! docker exec -i "$DB_CONTAINER" pg_dump -U resto "$slug" | gzip > "$STAGING/$slug.sql.gz"; then
    echo "  ✗ дамп БД $slug не создан" >&2
    rm -f -- "$STAGING/$slug.sql.gz"
    failed=1
  fi
  if ! tar -czf "$STAGING/$slug-content.tar.gz" -C "$site_dir" content; then
    echo "  ✗ content $slug не скопирован" >&2
    rm -f -- "$STAGING/$slug-content.tar.gz"
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "Бэкап не опубликован: один или несколько сайтов не скопированы" >&2
  exit 1
fi

mv -- "$STAGING" "$BACKUP_DIR"
STAGING=""

# Храним последние 14 бэкапов
mapfile -d '' sorted_backups < <(find "$BACKUPS_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name '.partial-*' -printf '%T@\t%p\0' | sort -zrn)
for ((i=14; i<${#sorted_backups[@]}; i++)); do
  old_backup=${sorted_backups[$i]#*$'\t'}
  # find emits direct children of BACKUPS_ROOT; keep this guard next to the
  # destructive operation so malformed/mock output cannot escape the root.
  case "$old_backup" in
    "$BACKUPS_ROOT"/*) ;;
    *) echo "Опасный путь бэкапа вне $BACKUPS_ROOT: $old_backup" >&2; exit 1 ;;
  esac
  rm -rf -- "$old_backup"
done

echo "✓ Бэкап: $BACKUP_DIR"
