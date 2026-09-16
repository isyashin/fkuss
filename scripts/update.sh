#!/usr/bin/env bash
# update.sh — обновление всех сервисов из git-репозитория.
# Использование: bash ~/resto/scripts/update.sh [--no-restart]
set -euo pipefail

SRC="${RESTO_SRC:-$HOME/resto/src}"
BASE="${RESTO_BASE:-$HOME/resto}"

echo "== git pull =="
git -C "$SRC" pull --ff-only

echo "== build образа шаблона =="
docker build -t resto-template:latest "$SRC/template"

echo "== build платформы =="
docker compose -f "$SRC/platform/docker-compose.yml" build

if [ "${1:-}" != "--no-restart" ]; then
  echo "== restart сервисов =="
  (cd "$SRC/template" && docker compose up -d)
  (cd "$SRC/platform" && docker compose up -d)
  for site in "$BASE"/sites/*/; do
    [ -f "$site/docker-compose.yml" ] && (cd "$site" && docker compose up -d)
  done
fi

echo "✓ Обновление завершено: $(git -C "$SRC" log --oneline -1)"
