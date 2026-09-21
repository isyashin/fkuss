#!/usr/bin/env bash
# update.sh — обновление всех сервисов из git-репозитория.
# Использование: bash ~/resto/scripts/update.sh [--no-restart]
set -euo pipefail

SRC="${RESTO_SRC:-$HOME/resto/src}"
BASE="${RESTO_BASE:-$HOME/resto}"

install_site_jobs() {
  local site_dir="$1"
  local slug
  local port
  slug=$(basename "${site_dir%/}")
  port=$(python3 - "$BASE/registry.json" "$slug" <<'PY'
import json, sys
try:
    print(json.load(open(sys.argv[1]))["sites"][sys.argv[2]]["port"])
except (FileNotFoundError, KeyError, TypeError):
    sys.exit(1)
PY
)
  "$SRC/scripts/install-site-jobs.sh" "$slug" "$port" "$site_dir/.env"
}

echo "== git pull =="
git -C "$SRC" pull --ff-only

echo "== build образа шаблона + migrator =="
docker build -t resto-template:latest "$SRC/template"
docker build --target migrator -t resto-template-migrator:latest "$SRC/template"

echo "== build платформы + migrator =="
docker compose -f "$SRC/platform/docker-compose.yml" build
docker build --target migrator -t platform-migrator:latest "$SRC/platform"

echo "== миграции БД =="
# resto (u-mamy): DATABASE_URL из .env сайта
RESTO_DB_URL=$(grep '^DATABASE_URL=' "$SRC/template/.env" | cut -d= -f2-)
docker run --rm --network template_default -e DATABASE_URL="$RESTO_DB_URL" resto-template-migrator:latest
# platform: DATABASE_URL из compose
PLATFORM_DB_URL=$(grep 'DATABASE_URL:' "$SRC/platform/docker-compose.yml" | head -1 | awk '{print $2}')
docker run --rm --network template_default -e DATABASE_URL="$PLATFORM_DB_URL" platform-migrator:latest
# сайты: per-site DATABASE_URL из .env
for site in "$BASE"/sites/*/; do
  if [ -f "$site/.env" ]; then
    SITE_DB_URL=$(grep '^DATABASE_URL=' "$site/.env" | cut -d= -f2-)
    docker run --rm --network template_default -e DATABASE_URL="$SITE_DB_URL" resto-template-migrator:latest
  fi
done

if [ "${1:-}" != "--no-restart" ]; then
  echo "== restart сервисов =="
  (cd "$SRC/template" && docker compose up -d)
  (cd "$SRC/platform" && docker compose up -d)
  for site in "$BASE"/sites/*/; do
    [ -f "$site/docker-compose.yml" ] && (cd "$site" && docker compose up -d)
  done
fi

echo "== cron-задачи сайтов =="
chmod 750 "$SRC/scripts/run-site-job.sh" "$SRC/scripts/install-site-jobs.sh"
for site in "$BASE"/sites/*/; do
  [ -f "$site/.env" ] && install_site_jobs "$site"
done

echo "✓ Обновление завершено: $(git -C "$SRC" log --oneline -1)"
