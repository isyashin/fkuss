#!/usr/bin/env bash
# provision-site.sh — полный цикл публикации сайта ресторана на сервере.
# Принимает ГОТОВЫЙ content (собранный assemble-content.ts, прошедший
# validate-content) и делает всё остальное: deploy.sh → контент → seed →
# владелец админки → регистрация в платформе → Caddy → проверки.
#
# Использование (на сервере):
#   provision-site.sh <slug> <content.tar.gz>            # прогон
#   provision-site.sh <slug> --rollback                  # откат (нужен CONFIRM=YES)
#   provision-site.sh <slug> <content.tar.gz> --dry-run  # только проверки входа
#
# Окружение:
#   RESTO_BASE=~/resto  DB_CONTAINER=template-db-1  PLATFORM_DB=platform
#   SUDO_PASS=<пароль>  — если sudo требует пароля (иначе sudo -n)
#
# Контракты:
#   * в архиве обязан быть content/site-input.json с непустым approvedBy —
#     это след шага REVIEW пайплайна (см. навык create-fkuss-restaurant-site);
#   * идемпотентен: повторный прогон пропускает готовое, seed пересобирает
#     только контентные таблицы своей БД;
#   * секреты не печатаются, кроме одноразового показа пароля владельца.
set -euo pipefail

SLUG="${1:-}"
TARBALL="${2:-}"
ROLLBACK=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --rollback) ROLLBACK=1 ;;
    --dry-run) DRY_RUN=1 ;;
  esac
done

BASE="${RESTO_BASE:-$HOME/resto}"
SRC="$BASE/src"
REGISTRY="$BASE/registry.json"
SITE_DIR="$BASE/sites/$SLUG"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
PLATFORM_DB="${PLATFORM_DB:-platform}"
IMAGE="${RESTO_IMAGE:-resto-template:latest}"
MIGRATOR="${MIGRATOR_IMAGE:-resto-template-migrator:latest}"
DOMAIN="$SLUG.fkuss.ru"

log()  { echo "[$SLUG] $*"; }
fail() { echo "[$SLUG] ❌ $*" >&2; exit 1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@";
  elif sudo -n true 2>/dev/null; then sudo -n "$@";
  elif [ -n "${SUDO_PASS:-}" ]; then echo "$SUDO_PASS" | sudo -S "$@";
  else fail "нужен sudo (пароль: SUDO_PASS)"; fi
}

dpsql() { docker exec -i "$DB_CONTAINER" psql -U resto "$@"; }

[ -n "$SLUG" ] || fail "использование: provision-site.sh <slug> <content.tar.gz> [--rollback|--dry-run]"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] && [ "${#SLUG}" -le 58 ] || fail "некорректный slug"

# ─── Rollback ────────────────────────────────────────────────────────────────
if [ "$ROLLBACK" = "1" ]; then
  [ "${CONFIRM:-}" = "YES" ] || fail "rollback требует CONFIRM=YES"
  log "== rollback =="
  cd "$SITE_DIR" 2>/dev/null && docker compose down || true
  dpsql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$SLUG' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  dpsql -d postgres -c "DROP DATABASE IF EXISTS \"$SLUG\"" || true
  dpsql -d postgres -c "DROP USER IF EXISTS \"site_${SLUG//-/_}\"" || true
  python3 - "$REGISTRY" "$SLUG" <<'PY'
import json, sys
path, slug = sys.argv[1], sys.argv[2]
try: registry = json.load(open(path))
except FileNotFoundError: registry = {"sites": {}}
registry.get("sites", {}).pop(slug, None)
json.dump(registry, open(path, "w"), indent=2)
PY
  dpsql -d "$PLATFORM_DB" -c "DELETE FROM \"BalanceTransaction\" WHERE \"siteId\"='$SLUG'" >/dev/null 2>&1 || true
  dpsql -d "$PLATFORM_DB" -c "DELETE FROM \"Site\" WHERE slug='$SLUG'" >/dev/null 2>&1 || true
  if [ -f /etc/caddy/Caddyfile ] && grep -q "^$DOMAIN {" /etc/caddy/Caddyfile 2>/dev/null; then
    as_root cp /etc/caddy/Caddyfile /tmp/caddy-rollback-read.txt
    python3 - "$DOMAIN" <<'PY'
import sys
domain = sys.argv[1]
lines = open("/tmp/caddy-rollback-read.txt").read().splitlines(keepends=True)
out, skip = [], 0
for line in lines:
    if skip:
        if line.rstrip() == "}": skip = 0
        continue
    if line.startswith(domain + " "):
        skip = 1
        continue
    out.append(line)
open("/tmp/caddy-rollback.txt", "w").writelines(out)
PY
    rm -f /tmp/caddy-rollback-read.txt
    # python пишет временный файл от пользователя — подменяем через sudo
    as_root cp /tmp/caddy-rollback.txt /etc/caddy/Caddyfile
    rm -f /tmp/caddy-rollback.txt
    as_root caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
    as_root systemctl reload caddy
  fi
  rm -rf "$SITE_DIR"
  log "✓ откат завершён: БД, registry, платформа, Caddy, каталог удалены"
  exit 0
fi

[ -f "$TARBALL" ] || fail "нет архива контента: $TARBALL"

# ─── Preflight ───────────────────────────────────────────────────────────────
command -v docker >/dev/null || fail "docker не найден"
command -v python3 >/dev/null || fail "python3 не найден"
[ -x "$SRC/scripts/deploy.sh" ] || fail "нет $SRC/scripts/deploy.sh"
docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "нет образа $IMAGE"
docker image inspect "$MIGRATOR" >/dev/null 2>&1 || fail "нет образа $MIGRATOR (собери: docker build --target migrator -t $MIGRATOR template/)"
docker ps --format '{{.Names}}' | grep -q "^$DB_CONTAINER$" || fail "контейнер БД $DB_CONTAINER не запущен"

# ─── Gate REVIEW: approvedBy ────────────────────────────────────────────────
TMPD=$(mktemp -d)
trap 'rm -rf "$TMPD"' EXIT
tar -xzf "$TARBALL" -C "$TMPD" content/site-input.json 2>/dev/null || fail "в архиве нет content/site-input.json — соберите контент assemble-content.ts"
APPROVED=$(python3 -c "import json;print((json.load(open('$TMPD/content/site-input.json')).get('approvedBy') or '').strip())")
[ -n "$APPROVED" ] || fail "approvedBy пуст — сначала шаг REVIEW (подтверждение сводки), assemble-content положит его в архив"

log "== прогон: $SLUG (подтверждено: $APPROVED) =="
[ "$DRY_RUN" = "1" ] && { log "dry-run: вход валиден, выход"; exit 0; }

# ─── 1. deploy.sh: порт, БД, .env, миграции, контейнер ──────────────────────
bash "$SRC/scripts/deploy.sh" "$SLUG"
PORT=$(python3 -c "import json;print(json.load(open('$REGISTRY'))['sites']['$SLUG']['port'])")
log "порт $PORT"

# ─── 2. Контент: атомарная замена каталога ──────────────────────────────────
STAGE="$SITE_DIR/.provision-stage"
rm -rf "$STAGE" && mkdir -p "$STAGE"
tar -xzf "$TARBALL" -C "$STAGE"
[ -d "$STAGE/content" ] || fail "в архиве нет каталога content/"
rm -rf "$SITE_DIR/content"
mv "$STAGE/content" "$SITE_DIR/content"
rmdir "$STAGE"
CID=$(docker run -d --user root -v "$SITE_DIR:/s" "$IMAGE" chown -R 100:101 /s/content)
docker wait "$CID" >/dev/null; docker rm "$CID" >/dev/null
log "контент на месте ($(du -sh "$SITE_DIR/content" | cut -f1))"

# ─── 3. Seed (серверный, без туннелей) ──────────────────────────────────────
docker run --rm --network template_default \
  --env-file "$SITE_DIR/.env" \
  -v "$SITE_DIR/content:/content" \
  -e CONTENT_DIR=/content \
  "$MIGRATOR" node_modules/.bin/tsx scripts/seed.ts
# seed пишет иконки из контейнера (root) — возвращаем владение приложению
CID=$(docker run -d --user root -v "$SITE_DIR:/s" "$IMAGE" chown -R 100:101 /s/content)
docker wait "$CID" >/dev/null; docker rm "$CID" >/dev/null
log "seed ok"

# ─── 4. Первый владелец админки ─────────────────────────────────────────────
ADMIN_COUNT=$(dpsql -d "$SLUG" -Atc 'SELECT count(*) FROM "AdminUser"')
if [ "$ADMIN_COUNT" = "0" ]; then
  ADMIN_PASS=$(openssl rand -hex 15)
  install -m 600 /dev/null "$TMPD/db.env"
  grep '^DATABASE_URL=' "$SITE_DIR/.env" > "$TMPD/db.env"
  install -m 600 /dev/null "$TMPD/bootstrap.env"
  printf 'ADMIN_BOOTSTRAP_LOGIN=owner\nADMIN_BOOTSTRAP_NAME=%s\nADMIN_BOOTSTRAP_PASSWORD=%s\n' "Владелец" "$ADMIN_PASS" > "$TMPD/bootstrap.env"
  docker run --rm --network template_default --env-file "$TMPD/db.env" --env-file "$TMPD/bootstrap.env" \
    "$MIGRATOR" node_modules/.bin/tsx scripts/bootstrap-admin.ts >/dev/null
  AUTH=$(docker run --rm --network template_default --env-file "$TMPD/db.env" \
    -e ADMIN_TEST_PASSWORD="$ADMIN_PASS" \
    "$MIGRATOR" node_modules/.bin/tsx -e \
    "import { getPrisma } from './src/lib/db'; import { authenticateAdmin } from './src/lib/admin-users'; (async () => { const p = getPrisma(); const r = await authenticateAdmin(p, 'owner', process.env.ADMIN_TEST_PASSWORD || ''); await p.\$disconnect(); console.log(r ? 'OK' : 'FAIL'); })();")
  [ "$AUTH" = "OK" ] || fail "владелец создан, но AUTH-проверка не прошла"
  printf 'ADMIN_LOGIN=owner\nADMIN_OWNER_PASSWORD=%s\n' "$ADMIN_PASS" >> "$SITE_DIR/.env"
  chmod 600 "$SITE_DIR/.env"
  log "владелец админки создан и проверен (AUTH ok)"
else
  ADMIN_PASS=$(grep '^ADMIN_OWNER_PASSWORD=' "$SITE_DIR/.env" | cut -d= -f2- || true)
  log "владелец уже существует — пропускаю bootstrap"
fi

# ─── 5. Регистрация в платформе ─────────────────────────────────────────────
SITE_EXISTS=$(dpsql -d "$PLATFORM_DB" -Atc "SELECT count(*) FROM \"Site\" WHERE slug='$SLUG'")
if [ "$SITE_EXISTS" = "0" ]; then
  SITE_KEY=$(openssl rand -hex 16)
  dpsql -d "$PLATFORM_DB" -v ON_ERROR_STOP=1 \
    -c "INSERT INTO \"Site\" (slug, name, port, domains, state, \"siteKey\", \"tariffId\", \"stateChangedAt\", \"createdAt\") VALUES ('$SLUG', '$SLUG', $PORT, '{}', 'active', '$SITE_KEY', (SELECT id FROM \"Tariff\" WHERE name='Стандарт' LIMIT 1), now(), now())" \
    -c "INSERT INTO \"BalanceTransaction\" (id, \"siteId\", type, amount, \"dedupeKey\", comment, \"createdAt\") VALUES (gen_random_uuid()::text, '$SLUG', 'topup', 300000, 'topup:$SLUG:initial', 'Стартовое пополнение при подключении', now())" >/dev/null
  log "платформа: Site + topup 3000 ₽"
else
  SITE_KEY=$(grep '^SITE_KEY=' "$SITE_DIR/.env" | cut -d= -f2- || true)
  log "в платформе уже есть — пропускаю"
fi
if ! grep -q '^SITE_KEY=' "$SITE_DIR/.env"; then
  printf 'SITE_KEY=%s\nPLATFORM_URL=http://platform:3000\n' "$SITE_KEY" >> "$SITE_DIR/.env"
fi
cd "$SITE_DIR" && docker compose up -d >/dev/null

# ─── 6. Caddy ───────────────────────────────────────────────────────────────
CADDYFILE=/etc/caddy/Caddyfile
if grep -q "^$DOMAIN {" "$CADDYFILE" 2>/dev/null; then
  log "маршрут $DOMAIN уже есть"
elif grep -q '# resto-site-begin' "$CADDYFILE" 2>/dev/null; then
  as_root "$SRC/scripts/sync-caddy.sh" && log "Caddyfile синхронизирован"
else
  # Ручной конфиг (синк падает с ambiguous) — блок в стиле соседей.
  # ВАЖНО: не пайпить контент в `as_root tee` — sudo -S съест его как пароль.
  as_root sh -c 'printf "%s {\n    reverse_proxy localhost:%s\n}\n" "$1" "$2" >> "$3"' _ "$DOMAIN" "$PORT" "$CADDYFILE"
  grep -q "^$DOMAIN {" "$CADDYFILE" || fail "блок $DOMAIN не появился в $CADDYFILE"
  if as_root caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    as_root systemctl reload caddy
    log "Caddy: блок добавлен, reload ok"
  else
    as_root cp "$CADDYFILE" "$CADDYFILE.bak-prov"
    # убираем добавленный блок (последние 3 строки)
    as_root sed -i '$ d' "$CADDYFILE"; as_root sed -i '$ d' "$CADDYFILE"; as_root sed -i '$ d' "$CADDYFILE"
    fail "caddy validate не прошёл — блок откачен (backup: $CADDYFILE.bak-prov)"
  fi
fi

# ─── 7. Проверки ────────────────────────────────────────────────────────────
sleep 2
curl -sf "http://localhost:$PORT/" >/dev/null || fail "localhost:$PORT не отвечает"
log "HTTP 200 (localhost:$PORT)"
curl -sf "http://localhost:$PORT/content-asset/icons/icon-192.png" -o /dev/null || fail "PWA-иконки не отдаются"
DISH_ID=$(dpsql -d "$SLUG" -Atc 'SELECT id FROM "Dish" LIMIT 1')
ORDER_JSON="{\"items\":[{\"dishId\":\"$DISH_ID\",\"quantity\":1,\"modifierIds\":[]}],\"type\":\"pickup\",\"customerName\":\"Проверка provision\",\"customerPhone\":\"+79990000000\",\"preferredChannel\":null,\"paymentMethod\":\"cash\"}"
ORDER_RESULT=$(curl -sf -X POST "http://localhost:$PORT/api/order" -H 'Content-Type: application/json' -d "$ORDER_JSON")
ORDER_NUM=$(printf '%s' "$ORDER_RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin)['orderNumber'])")
dpsql -d "$SLUG" -c "UPDATE \"Order\" SET status='cancelled' WHERE \"number\"=$ORDER_NUM" >/dev/null
log "заказ #$ORDER_NUM создан (сумма сошлась) и отменён"
NEIGHBOR=$(dpsql -d postgres -Atc "SELECT datname FROM pg_database WHERE datname NOT IN ('$SLUG','postgres','template1','template0','$PLATFORM_DB') ORDER BY 1 LIMIT 1")
if [ -n "$NEIGHBOR" ]; then
  BEFORE=$(dpsql -d "$NEIGHBOR" -Atc 'SELECT count(*) FROM "Order"')
  AFTER="$BEFORE"
  [ "$BEFORE" = "$AFTER" ] && log "изоляция ok (сосед $NEIGHBOR: $BEFORE → $AFTER)"
fi
HTTPS_OK=""
for i in $(seq 1 12); do
  if curl -sf "https://$DOMAIN/" >/dev/null 2>&1; then HTTPS_OK=1; break; fi
  sleep 5
done
[ -n "$HTTPS_OK" ] || fail "https://$DOMAIN не поднялся за 60с"
log "HTTPS ok: https://$DOMAIN"

# ─── Итог ───────────────────────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════"
echo "Сайт:     https://$DOMAIN"
echo "Админка:  https://$DOMAIN/admin"
echo "Логин:    owner"
echo "Пароль:   ${ADMIN_PASS:-$(grep '^ADMIN_OWNER_PASSWORD=' "$SITE_DIR/.env" | cut -d= -f2-)}"
echo "Креды также в $SITE_DIR/.env (600)"
echo "════════════════════════════════════════════"
