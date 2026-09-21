#!/usr/bin/env bash
# sync-caddy.sh — синхронизация Caddyfile с состоянием сайтов платформы.
# Приостановленные сайты получают заглушку, активные — reverse_proxy.
# Запуск по cron на хосте: bash ~/resto/src/scripts/sync-caddy.sh
set -euo pipefail

BASE="${RESTO_BASE:-$HOME/resto}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

SITES_JSON=$(docker exec -i "$DB_CONTAINER" psql -U resto platform -Atc \
  "SELECT slug, state, port, coalesce(domains[1], '') FROM \"Site\" ORDER BY slug")

[ -f "$CADDYFILE" ] || { echo "Нет $CADDYFILE"; exit 0; }

TMP=$(mktemp)
STAGE=""
cleanup() {
  rm -f -- "$TMP"
  [ -z "$STAGE" ] || as_root rm -f -- "$STAGE"
}
trap cleanup EXIT

# Сохраняем всё, что НЕ наши управляемые блоки. Кандидат проверяется до записи.
awk '/^# resto-site-begin$/{skip=1} /^# resto-site-end$/{skip=0; next} !skip' "$CADDYFILE" > "$TMP"

{
  echo "# resto-site-begin"
  while IFS='|' read -r slug state port domain; do
    [ -z "$slug" ] && continue
    if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
      echo "Некорректный slug в данных платформы: $slug" >&2
      exit 1
    fi
    if [[ ! "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
      echo "Некорректный порт для $slug" >&2
      exit 1
    fi
    [ -z "$domain" ] && domain="$slug.fkuss.ru"
    if [[ ! "$domain" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]]; then
      echo "Некорректный домен для $slug" >&2
      exit 1
    fi
    if [ "$state" = "suspended" ]; then
      echo "$domain {"
      echo "    respond \"Сайт временно недоступен\" 503"
      echo "}"
    elif [ "$state" = "active" ] || [ "$state" = "grace" ]; then
      echo "$domain {"
      echo "    reverse_proxy localhost:$port"
      echo "}"
    else
      echo "Неизвестное состояние сайта $slug: $state" >&2
      exit 1
    fi
    echo ""
  done <<< "$SITES_JSON"
  echo "# resto-site-end"
} >> "$TMP"

if ! cmp -s "$TMP" "$CADDYFILE"; then
  # Stage beside the live config so relative imports resolve as for the live file.
  STAGE=$(as_root mktemp "${CADDYFILE}.sync.XXXXXX")
  as_root cp -- "$TMP" "$STAGE"
  as_root chmod 644 "$STAGE"
  if ! caddy validate --config "$STAGE"; then
    echo "Новый Caddyfile не прошёл проверку; текущий конфиг не изменён" >&2
    exit 1
  fi
  BACKUP="$CADDYFILE.bak"
  as_root cp -p -- "$CADDYFILE" "$BACKUP"
  as_root mv -f -- "$STAGE" "$CADDYFILE"
  STAGE=""
  if as_root systemctl reload caddy; then
    :
  else
    reload_rc=$?
    echo "Ошибка reload Caddy; восстанавливаю предыдущий конфиг" >&2
    if ! as_root cp -p -- "$BACKUP" "$CADDYFILE"; then
      echo "Не удалось восстановить backup Caddyfile" >&2
      exit "$reload_rc"
    fi
    if ! as_root systemctl reload caddy; then
      echo "Не удалось перезагрузить восстановленный Caddyfile" >&2
    fi
    exit "$reload_rc"
  fi
  echo "✓ Caddyfile обновлён"
fi
