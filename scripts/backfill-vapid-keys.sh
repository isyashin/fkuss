#!/usr/bin/env bash
# backfill-vapid-keys.sh — одноразовый безопасный backfill ключей VAPID
# для существующих tenant-сайтов. Дописывает VAPID_* только в .env, где ключей
# ещё нет; права файла сохраняются (600). Значения не выводятся.
#
# Использование: scripts/backfill-vapid-keys.sh            # все сайты реестра
#                scripts/backfill-vapid-keys.sh <slug> ... # конкретные сайты
set -euo pipefail

BASE="${RESTO_BASE:-$HOME/resto}"
IMAGE="resto-template:latest"

gen_vapid_pair() {
  # ECDH P-256 как у web-push generate-vapid-keys; только node:crypto внутри образа.
  docker run --rm "$IMAGE" node -e "const c=require('node:crypto');const e=c.createECDH('prime256v1');e.generateKeys();const b=(x)=>Buffer.from(x).toString('base64url');process.stdout.write(b(e.getPublicKey())+' '+b(e.getPrivateKey()));"
}

fill_one() {
  local slug="$1"
  local env_file="$BASE/sites/$slug/.env"
  if [ ! -f "$env_file" ]; then
    echo "SKIP $slug: .env не найден" >&2
    return 0
  fi
  if grep -q '^VAPID_PUBLIC_KEY=' "$env_file"; then
    echo "SKIP $slug: ключи уже есть"
    return 0
  fi
  local pair public private
  pair=$(gen_vapid_pair)
  public=${pair%% *}
  private=${pair##* }
  {
    printf '\n# Web push админки (добавлено backfill-vapid-keys.sh)\n'
    printf 'VAPID_PUBLIC_KEY=%s\n' "$public"
    printf 'VAPID_PRIVATE_KEY=%s\n' "$private"
    printf 'VAPID_SUBJECT=mailto:push@fkuss.ru\n'
  } >> "$env_file"
  chmod 600 "$env_file"
  echo "OK   $slug: VAPID-ключи добавлены"
}

if [ "$#" -gt 0 ]; then
  for slug in "$@"; do fill_one "$slug"; done
else
  for dir in "$BASE"/sites/*; do
    [ -d "$dir" ] || continue
    fill_one "$(basename "$dir")"
  done
fi

echo "Готово. Контейнерам нужен перезапуск для чтения новых env (штатно — update.sh)."
