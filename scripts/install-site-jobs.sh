#!/usr/bin/env bash
# install-site-jobs.sh — устанавливает cron-задачи одного tenant-сайта.
set -euo pipefail

SLUG="${1:-}"
PORT="${2:-}"
ENV_FILE="${3:-}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
RUNNER="$SCRIPT_DIR/run-site-job.sh"

if ! [[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ ! -r "$ENV_FILE" ]; then
  echo "Использование: install-site-jobs.sh <slug> <port> <site-env>" >&2
  exit 1
fi
if [ ! -x "$RUNNER" ]; then
  echo "Не найден исполняемый run-site-job.sh" >&2
  exit 1
fi

# Убираем только старые и новые строки этого сайта: чужие cron-задачи сохраняем.
CURRENT_CRON=$(crontab -l 2>/dev/null || true)
{
  printf '%s\n' "$CURRENT_CRON" | grep -Ev "(# resto $SLUG (report-metrics|sync-menu)$|localhost:$PORT/api/jobs/(report-metrics|sync-menu))" || true
  printf '%s\n' "0 */6 * * * \"$RUNNER\" \"$PORT\" \"$ENV_FILE\" report-metrics >/dev/null 2>&1 # resto $SLUG report-metrics"
  printf '%s\n' "*/15 * * * * \"$RUNNER\" \"$PORT\" \"$ENV_FILE\" sync-menu >/dev/null 2>&1 # resto $SLUG sync-menu"
} | crontab -
