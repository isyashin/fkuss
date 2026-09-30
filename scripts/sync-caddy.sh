#!/usr/bin/env bash
# sync-caddy.sh — синхронизация Caddyfile с состоянием сайтов платформы.
# Приостановленные сайты получают заглушку, активные — reverse_proxy.
# LAN-блок :80 (*.resto.local из registry.json) тоже управляемый: legacy-блок
# :80 без маркеров заменяется сгенерированным (сайты берутся из реестра,
# платформа — PLATFORM_PORT). Запуск по cron на хосте:
#   sudo /home/ilya/resto/src/scripts/sync-caddy.sh
set -euo pipefail

# BASE от пути скрипта: при запуске через sudo HOME=/root, а скрипт лежит в <base>/src/scripts/.
BASE="${RESTO_BASE:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)}"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
PLATFORM_PORT="${PLATFORM_PORT:-3100}"

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

SITES_JSON=$(docker exec -i "$DB_CONTAINER" psql -U resto platform -Atc \
  "SELECT slug, state, port, coalesce(domains[1], '') FROM \"Site\" ORDER BY slug")

LAN_SITES=$(python3 - "$BASE/registry.json" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1]))["sites"]
except (FileNotFoundError, KeyError, TypeError):
    sys.exit(0)
for slug, site in sorted(data.items()):
    port = site.get("port")
    if isinstance(port, int) and 1 <= port <= 65535:
        print(f"{slug}|{port}")
PY
)

[ -f "$CADDYFILE" ] || { echo "Нет $CADDYFILE"; exit 0; }

TMP=$(mktemp)
STAGE=""
cleanup() {
  rm -f -- "$TMP"
  [ -z "$STAGE" ] || as_root rm -f -- "$STAGE"
}
trap cleanup EXIT

# Сохраняем всё, что НЕ наши управляемые блоки. Кандидат проверяется до записи.
# Управляемое: блок между resto-lan-begin/end, legacy-блок ":80 { ... }"
# (одноуровневые фигурные скобки) и блок между resto-site-begin/end.
awk '
  /^# resto-lan-begin$/   {skip="lan"; next}
  /^# resto-lan-end$/     {skip=""; next}
  /^# resto-site-begin$/  {skip="site"; next}
  /^# resto-site-end$/    {skip=""; next}
  skip=="lan" || skip=="site" {next}
  $0 == ":80 {"           {skip="legacy80"; next}
  skip=="legacy80" && $0 == "}" {skip=""; next}
  !skip {print}
' "$CADDYFILE" > "$TMP"

# LAN-блок :80 — маршруты из registry.json + платформа + catch-all.
{
  echo "# resto-lan-begin"
  echo ":80 {"
  while IFS='|' read -r slug port; do
    [ -z "$slug" ] && continue
    if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
      echo "Некорректный slug в реестре: $slug" >&2
      exit 1
    fi
    echo "    @${slug} host ${slug}.resto.local"
    echo "    handle @${slug} {"
    echo "        reverse_proxy localhost:${port}"
    echo "    }"
  done <<< "$LAN_SITES"
  echo "    @platform host platform.resto.local"
  echo "    handle @platform {"
  echo "        reverse_proxy localhost:${PLATFORM_PORT}"
  echo "    }"
  echo "    handle {"
  echo "        respond \"resto platform: укажите Host сайта\" 200"
  echo "    }"
  echo "}"
  echo "# resto-lan-end"
  echo ""
} >> "$TMP"

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
  if ! caddy validate --config "$STAGE" --adapter caddyfile; then
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
    echo "Ошибка reload Caddy; восстанавливаю прежний конфиг" >&2
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
