#!/usr/bin/env bash
# perf-smoke.sh — быстрый замер отклика ключевых страниц сайта.
# Использование: bash scripts/perf-smoke.sh <порт> [хост]
# Порог: TTFB критических страниц < 0.5 с на dev-ВМ (холодный рендер).
set -uo pipefail

PORT="${1:-3000}"
HOST="${2:-localhost}"
BASE="http://$HOST:$PORT"
THRESHOLD_MS=500
failed=0

measure() {
  local path="$1" note="$2"
  local ttfb status
  ttfb=$(curl -s -o /dev/null -w "%{time_starttransfer}" "$BASE$path")
  status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  local ms
  ms=$(awk "BEGIN { printf \"%d\", $ttfb * 1000 }")
  if [ "$ms" -le "$THRESHOLD_MS" ]; then
    printf "ok   %-28s %4d ms  (HTTP %s)\n" "$note" "$ms" "$status"
  else
    printf "FAIL %-28s %4d ms  (HTTP %s)  — медленнее порога %d ms\n" "$note" "$ms" "$status" "$THRESHOLD_MS"
    failed=1
  fi
}

echo "== perf-smoke $BASE (порог TTFB ${THRESHOLD_MS} мс) =="
measure "/" "витрина"
measure "/booking" "бронирование"
measure "/account" "кабинет гостя"
measure "/admin" "админка (guard)"

if [ "$failed" -eq 0 ]; then
  echo "✓ отклик в норме"
else
  echo "✗ есть медленные страницы"
fi
exit "$failed"
