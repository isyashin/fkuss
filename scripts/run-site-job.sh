#!/usr/bin/env bash
# run-site-job.sh — безопасный HTTP-запуск cron-job одного сайта.
# Секрет передаётся curl через временный конфиг, а не через командную строку.
set -euo pipefail

PORT="${1:-}"
ENV_FILE="${2:-}"
JOB="${3:-}"

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ ! -r "$ENV_FILE" ]; then
  echo "Использование: run-site-job.sh <port> <site-env> <report-metrics|sync-menu>" >&2
  exit 1
fi

case "$JOB" in
  report-metrics|sync-menu) ;;
  *)
    echo "Неизвестная job: $JOB" >&2
    exit 1
    ;;
esac

# deploy.sh генерирует hex-секрет. Ограничение не даёт значению .env изменить
# синтаксис конфигурации curl.
CRON_SECRET=$(sed -n 's/^CRON_SECRET=//p' "$ENV_FILE" | head -n 1)
if ! [[ "$CRON_SECRET" =~ ^[A-Za-z0-9_-]{16,}$ ]]; then
  echo "В $ENV_FILE не найден корректный CRON_SECRET" >&2
  exit 1
fi

umask 077
CURL_CONFIG=$(mktemp)
trap 'rm -f "$CURL_CONFIG"' EXIT HUP INT TERM

{
  printf '%s\n' 'request = "POST"'
  printf '%s\n' "header = \"X-Cron-Secret: $CRON_SECRET\""
  printf '%s\n' "url = \"http://127.0.0.1:$PORT/api/jobs/$JOB\""
  printf '%s\n' 'output = "/dev/null"'
} > "$CURL_CONFIG"

curl --fail --silent --show-error --config "$CURL_CONFIG"
