#!/usr/bin/env bash
# sync-caddy.sh — синхронизация Caddyfile с состоянием сайтов платформы.
# Приостановленные сайты получают заглушку, активные — reverse_proxy.
# Запуск по cron на хосте: bash ~/resto/src/scripts/sync-caddy.sh
set -euo pipefail

BASE="${RESTO_BASE:-$HOME/resto}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"

SITES_JSON=$(docker exec -i "$DB_CONTAINER" psql -U resto platform -Atc \
  "SELECT slug, state, port, coalesce(domains[1], '') FROM \"Site\" ORDER BY slug")

[ -f "$CADDYFILE" ] || { echo "Нет $CADDYFILE"; exit 0; }

TMP=$(mktemp)
# Сохраняем всё, что НЕ наши управляемые блоки (маркеры # resto-site-begin/end)
awk '/^# resto-site-begin$/{skip=1} /^# resto-site-end$/{skip=0; next} !skip' "$CADDYFILE" > "$TMP"

{
  echo "# resto-site-begin"
  while IFS='|' read -r slug state port domain; do
    [ -z "$slug" ] && continue
    [ -z "$domain" ] && domain="$slug.fkuss.ru"
    if [ "$state" = "suspended" ]; then
      echo "$domain {"
      echo "    respond \"Сайт временно недоступен\" 503"
      echo "}"
    else
      echo "$domain {"
      echo "    reverse_proxy localhost:$port"
      echo "}"
    fi
    echo ""
  done <<< "$SITES_JSON"
  echo "# resto-site-end"
} >> "$TMP"

if ! cmp -s "$TMP" "$CADDYFILE"; then
  cp "$CADDYFILE" "$CADDYFILE.bak"
  if [ "$(id -u)" -eq 0 ]; then
    mv "$TMP" "$CADDYFILE"
  else
    sudo -n mv "$TMP" "$CADDYFILE" 2>/dev/null || { echo "Нужен sudo для записи Caddyfile"; rm -f "$TMP"; exit 1; }
  fi
  caddy validate --config "$CADDYFILE" >/dev/null && systemctl reload caddy || systemctl reload caddy || true
  echo "✓ Caddyfile обновлён"
else
  rm -f "$TMP"
fi
