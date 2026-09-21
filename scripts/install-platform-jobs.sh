#!/usr/bin/env bash
# install-platform-jobs.sh — устанавливает хостовые cron-задачи платформы.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROCESS_EXPORTS="$SCRIPT_DIR/process-exports.sh"

if [ ! -x "$PROCESS_EXPORTS" ]; then
  echo "Не найден исполняемый process-exports.sh" >&2
  exit 1
fi

# Удаляем только строку, которой управляет этот скрипт; остальные задания сохраняем.
CURRENT_CRON=$(crontab -l 2>/dev/null || true)
{
  printf '%s\n' "$CURRENT_CRON" | grep -Ev '# resto platform process-exports$' || true
  printf '%s\n' "*/5 * * * * \"$PROCESS_EXPORTS\" >/dev/null 2>&1 # resto platform process-exports"
} | crontab -
