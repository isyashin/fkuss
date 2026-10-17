#!/usr/bin/env bash
# NEW sites on legacy shared PostgreSQL only. Existing content is never reseeded.
# Explicit topology: docs/TOPOLOGY-OPERATIONS.md.
# provision-site.sh <slug> <content.tar.gz> [--dry-run]
# CONFIRM=YES provision-site.sh <slug> --rollback
set -euo pipefail
umask 077
SLUG="${1:-}"
TARBALL="${2:-}"
MODE=apply
fail() { echo "[$SLUG] $*" >&2; exit 1; }
log() { echo "[$SLUG] $*"; }
if [ "$TARBALL" = --rollback ]; then
  [ "$#" = 2 ] || fail "rollback accepts no other arguments"
  MODE=rollback
else
  [ "$#" = 2 ] || [ "$#" = 3 ] || fail "usage: provision-site.sh <slug> <archive> [--dry-run]"
  [[ "$TARBALL" != --* ]] || fail "unknown option"
  if [ "$#" = 3 ]; then [ "$3" = --dry-run ] || fail "unknown option"; MODE=dry-run; fi
fi
[[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] && [ "${#SLUG}" -le 58 ] || fail "invalid slug"
[ -z "${RESTO_TOPOLOGY:-}" ] || fail "legacy command cannot provision explicit topology; see docs/TOPOLOGY-OPERATIONS.md"
BASE="${RESTO_BASE:-$HOME/resto}"
[ -d "$BASE" ] || fail "RESTO_BASE must already exist"
BASE=$(cd "$BASE" && pwd -P)
SRC="$BASE/src"
REGISTRY="$BASE/registry.json"
SITE_DIR="$BASE/sites/$SLUG"
STATE="$BASE/provisions/$SLUG.json"
[ ! -L "$BASE/sites" ] && [ ! -L "$BASE/provisions" ] || fail "publication roots cannot be symlinks"
DATA="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/provision-data.py"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"
PLATFORM_DB="${PLATFORM_DB:-platform}"
DB_USER="site_${SLUG//-/_}"
IMAGE="${RESTO_IMAGE:-resto-template:latest}"
MIGRATOR="${MIGRATOR_IMAGE:-resto-template-migrator:latest}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
[ -x "$SRC/scripts/deploy.sh" ] && [ -f "$DATA" ] || fail "source checkout is incomplete"
exec 9>"$BASE/.provision.lock"
flock -n 9 || fail "another publication is running"
as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@";
  elif sudo -n true 2>/dev/null; then sudo -n "$@";
  elif [ -n "${SUDO_PASS:-}" ]; then printf '%s\n' "$SUDO_PASS" | sudo -S "$@";
  else fail "sudo access is required"; fi
}
dpsql() { docker exec -i "$DB_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U resto "$@"; }
field() { python3 "$DATA" get "$STATE" "$1"; }
done_stage() { python3 "$DATA" done "$STATE" "$1"; }
mark() { python3 "$DATA" mark "$STATE" "$1"; }
db_exists() { [ "$(dpsql -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$SLUG'")" = 1 ]; }
business_empty() {
  local table exists count
  for table in Order Customer Reservation BonusTransaction; do
    exists=$(dpsql -d "$SLUG" -Atc "SELECT to_regclass('\"$table\"') IS NOT NULL") || return 1
    if [ "$exists" = t ]; then
      count=$(dpsql -d "$SLUG" -Atc "SELECT count(*) FROM \"$table\"") || return 1
      [ "$count" = 0 ] || return 1
    fi
  done
}
[ -r "$CADDYFILE" ] && grep -q '^# resto-site-begin$' "$CADDYFILE" || fail "legacy managed Caddy blocks must exist before publication"
docker network inspect template_default >/dev/null
dpsql -d "$PLATFORM_DB" -Atc 'SELECT count(*) FROM "Site"' >/dev/null

if [ "$MODE" = rollback ]; then
  [ "${CONFIRM:-}" = YES ] || fail "rollback requires CONFIRM=YES"
  python3 "$DATA" owned "$STATE" "$SLUG" "$SITE_DIR"
  PUB=$(field publicationId)
  OWN_KEY=""
  LIVE_KEY=$(dpsql -d "$PLATFORM_DB" -Atc "SELECT \"siteKey\" FROM \"Site\" WHERE slug='$SLUG'")
  if [ -n "$LIVE_KEY" ]; then
    [ -f "$SITE_DIR/.env" ] || fail "private site env is missing"
    OWN_KEY=$(sed -n 's/^SITE_KEY=//p' "$SITE_DIR/.env")
    [[ "$OWN_KEY" =~ ^[a-f0-9]{64}$ ]] && [ "$OWN_KEY" = "$LIVE_KEY" ] || fail "platform ownership changed"
  fi
  unset LIVE_KEY
  if db_exists; then
    OWNER=$(dpsql -d postgres -Atc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$SLUG'")
    [ "$OWNER" = "$DB_USER" ] || fail "database ownership changed"
    business_empty || fail "business data exists; use backup/decommission instead of rollback"
  fi
  [ "$(dpsql -d postgres -Atc "SELECT count(*) FROM pg_database WHERE pg_get_userbyid(datdba)='$DB_USER' AND datname<>'$SLUG'")" = 0 ] || fail "role owns another database"
  [ "$(dpsql -d "$PLATFORM_DB" -Atc "SELECT (SELECT count(*) FROM \"Payment\" WHERE \"siteId\"='$SLUG') + (SELECT count(*) FROM \"Invoice\" WHERE \"siteId\"='$SLUG') + (SELECT count(*) FROM \"BalanceTransaction\" WHERE \"siteId\"='$SLUG' AND \"dedupeKey\" IS DISTINCT FROM 'provision:$PUB:initial')")" = 0 ] || fail "platform financial history exists"
  STOPPED=0
  trap 'if [ "$STOPPED" = 1 ]; then (cd "$SITE_DIR" && docker compose up -d app); fi' EXIT
  if [ -f "$SITE_DIR/docker-compose.yml" ]; then
    (cd "$SITE_DIR" && docker compose stop app)
    STOPPED=1
  fi
  # Check again after draining requests: an order could arrive during preflight.
  if db_exists; then business_empty || fail "business data arrived; rollback refused"; fi
  dpsql -d "$PLATFORM_DB" >/dev/null <<SQL
BEGIN;
DO 'BEGIN IF EXISTS (SELECT 1 FROM "Site" WHERE slug=''$SLUG'' AND "siteKey"<>''$OWN_KEY'') THEN RAISE EXCEPTION ''platform ownership changed''; END IF; END';
DELETE FROM "MetricSnapshot" WHERE "siteId"='$SLUG';
DELETE FROM "BalanceTransaction" WHERE "siteId"='$SLUG' AND "dedupeKey"='provision:$PUB:initial';
DELETE FROM "OwnerAccount" WHERE id='provision-$PUB' AND "siteId"='$SLUG';
DELETE FROM "Site" WHERE slug='$SLUG' AND "siteKey"='$OWN_KEY';
COMMIT;
SQL
  python3 - "$REGISTRY" "$SLUG" <<'PY'
import json, os, sys
from pathlib import Path
path, slug = Path(sys.argv[1]), sys.argv[2]
if path.exists():
    data = json.loads(path.read_text()); data.get('sites', {}).pop(slug, None)
    temporary = path.with_suffix('.provision-tmp')
    temporary.write_text(json.dumps(data, indent=2)); os.replace(temporary, path)
PY
  as_root env RESTO_BASE="$BASE" DB_CONTAINER="$DB_CONTAINER" PLATFORM_DB="$PLATFORM_DB" CADDYFILE="$CADDYFILE" "$SRC/scripts/sync-caddy.sh"
  STOPPED=0
  if [ -f "$SITE_DIR/docker-compose.yml" ]; then (cd "$SITE_DIR" && docker compose down); fi
  dpsql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$SLUG' AND pid<>pg_backend_pid()" >/dev/null
  dpsql -d postgres -c "DROP DATABASE IF EXISTS \"$SLUG\"" >/dev/null
  dpsql -d postgres -c "DROP ROLE IF EXISTS \"$DB_USER\"" >/dev/null
  CURRENT_CRON=$(crontab -l 2>/dev/null || true)
  { printf '%s\n' "$CURRENT_CRON" | grep -Ev "# resto $SLUG (report-metrics|sync-menu|push-delivery)$" || true; } | crontab -
  # Exact resolved path was checked against the journal; never remove other sites.
  rm -rf -- "$SITE_DIR"
  rm -- "$STATE"
  log "unused owned publication removed"
  exit 0
fi

[ -f "$TARBALL" ] || fail "content archive is required"
TMPD=$(mktemp -d)
trap 'rm -rf -- "$TMPD"' EXIT
python3 "$DATA" extract "$TARBALL" "$SLUG" "$TMPD"
docker image inspect "$IMAGE" >/dev/null
docker image inspect "$MIGRATOR" >/dev/null
# Complete zod + media readiness validation before allocating site resources.
docker run --rm --network none -v "$TMPD/content:/content:ro" "$MIGRATOR" node_modules/.bin/tsx scripts/validate-content.ts /content
DOMAIN=$(python3 "$DATA" get "$TMPD/metadata.json" domain)
TARIFF=$(python3 "$DATA" get "$TMPD/metadata.json" tariffId)
EMAIL=$(python3 "$DATA" get "$TMPD/metadata.json" ownerEmail)
[ "$(dpsql -d "$PLATFORM_DB" -Atc "SELECT count(*) FROM \"Tariff\" WHERE id='$TARIFF'")" = 1 ] || fail "reviewed tariff does not exist"
OTHER_OWNER=$(dpsql -d "$PLATFORM_DB" -Atc "SELECT \"siteId\" FROM \"OwnerAccount\" WHERE email='$EMAIL'")
[ -z "$OTHER_OWNER" ] || [ "$OTHER_OWNER" = "$SLUG" ] || fail "owner email belongs to another site"
[ "$(dpsql -d "$PLATFORM_DB" -Atc "SELECT count(*) FROM \"Site\" WHERE '$DOMAIN'=ANY(domains) AND slug<>'$SLUG'")" = 0 ] || fail "domain belongs to another site"
if [ -e "$STATE" ] || [ -L "$STATE" ]; then
  python3 "$DATA" owned "$STATE" "$SLUG" "$SITE_DIR"
  python3 "$DATA" start "$STATE" "$TMPD/metadata.json" "$SITE_DIR"
else
  [ ! -e "$SITE_DIR" ] && [ ! -L "$SITE_DIR" ] || fail "existing site directory cannot be adopted"
  db_exists && fail "existing database cannot be adopted"
  [ "$(dpsql -d postgres -Atc "SELECT count(*) FROM pg_roles WHERE rolname='$DB_USER'")" = 0 ] || fail "existing database role cannot be adopted"
  [ "$(dpsql -d "$PLATFORM_DB" -Atc "SELECT count(*) FROM \"Site\" WHERE slug='$SLUG'")" = 0 ] || fail "existing platform site cannot be adopted"
  python3 - "$REGISTRY" "$SLUG" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
if path.exists() and sys.argv[2] in json.loads(path.read_text()).get('sites', {}):
    raise SystemExit('existing registry entry cannot be adopted')
PY
fi
[ "$MODE" != dry-run ] || { log "archive and legacy preflight valid; no site resources changed"; exit 0; }
mkdir -p "$BASE/provisions"
chmod 700 "$BASE/provisions"
python3 "$DATA" start "$STATE" "$TMPD/metadata.json" "$SITE_DIR"
PUB=$(field publicationId)
if done_stage complete; then
  PORT=$(python3 - "$REGISTRY" "$SLUG" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))['sites'][sys.argv[2]]['port'])
PY
)
  curl -fsS "http://127.0.0.1:$PORT/" -o /dev/null
  curl -fsS "https://$DOMAIN/" -o /dev/null
  log "already published; content, settings, credentials and balance preserved: https://$DOMAIN"
  exit 0
fi
if ! done_stage deploy; then
  RESTO_BASE="$BASE" RESTO_IMAGE="$IMAGE" MIGRATOR_IMAGE="$MIGRATOR" SITE_BIND_HOST=127.0.0.1 bash "$SRC/scripts/deploy.sh" "$SLUG" "--domain=$DOMAIN"
  mark deploy
fi
PORT=$(python3 - "$REGISTRY" "$SLUG" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))['sites'][sys.argv[2]]['port'])
PY
)
if ! done_stage content; then
  [ -d "$SITE_DIR/content" ] && [ ! -L "$SITE_DIR/content" ] || fail "unexpected content mount"
  if [ -z "$(find "$SITE_DIR/content" -mindepth 1 -print -quit)" ]; then
    rmdir "$SITE_DIR/content"
    mv "$TMPD/content" "$SITE_DIR/content"
  else
    diff -qr "$TMPD/content" "$SITE_DIR/content" >/dev/null || fail "partial content differs; automatic replacement refused"
  fi
  docker run --rm --user root -v "$SITE_DIR/content:/content" "$IMAGE" chown -R 100:101 /content
  (cd "$SITE_DIR" && docker compose up -d --force-recreate app)
  mark content
fi
if ! done_stage seed; then
  docker run --rm --network template_default --env-file "$SITE_DIR/.env" -v "$SITE_DIR/content:/content" -e CONTENT_DIR=/content "$MIGRATOR" node_modules/.bin/tsx scripts/seed.ts
  docker run --rm --user root -v "$SITE_DIR/content:/content" "$IMAGE" chown -R 100:101 /content
  mark seed
fi
if ! done_stage owner; then
  if ! grep -q '^ADMIN_OWNER_PASSWORD=' "$SITE_DIR/.env"; then printf 'ADMIN_OWNER_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> "$SITE_DIR/.env"; fi
  ADMIN_PASS=$(sed -n 's/^ADMIN_OWNER_PASSWORD=//p' "$SITE_DIR/.env")
  ADMIN_COUNT=$(dpsql -d "$SLUG" -Atc 'SELECT count(*) FROM "AdminUser"')
  printf 'ADMIN_BOOTSTRAP_LOGIN=owner\nADMIN_BOOTSTRAP_NAME=Владелец\nADMIN_BOOTSTRAP_PASSWORD=%s\n' "$ADMIN_PASS" > "$TMPD/bootstrap.env"
  if [ "$ADMIN_COUNT" = 0 ]; then
    docker run --rm --network template_default --env-file "$SITE_DIR/.env" --env-file "$TMPD/bootstrap.env" "$MIGRATOR" node_modules/.bin/tsx scripts/bootstrap-admin.ts
  fi
  AUTH=$(docker run --rm --network template_default --env-file "$SITE_DIR/.env" --env-file "$TMPD/bootstrap.env" "$MIGRATOR" node_modules/.bin/tsx -e "import {getPrisma} from './src/lib/db'; import {authenticateAdmin,revokeAdminSession} from './src/lib/admin-users'; (async()=>{const p=getPrisma();try{const a=await authenticateAdmin(p,'owner',process.env.ADMIN_BOOTSTRAP_PASSWORD||'');if(a)await revokeAdminSession(p,a.token);console.log(a?'OK':'FAIL')}finally{await p.\$disconnect()}})()")
  [ "$AUTH" = OK ] || fail "owner authentication failed; credentials were not reset"
  unset ADMIN_PASS
  mark owner
fi
if ! done_stage platform; then
  if ! grep -q '^SITE_KEY=' "$SITE_DIR/.env"; then printf 'SITE_KEY=%s\n' "$(openssl rand -hex 32)" >> "$SITE_DIR/.env"; fi
  SITE_KEY=$(sed -n 's/^SITE_KEY=//p' "$SITE_DIR/.env")
  [[ "$SITE_KEY" =~ ^[a-f0-9]{64}$ ]] || fail "unexpected site key format"
  LIVE_KEY=$(dpsql -d "$PLATFORM_DB" -Atc "SELECT \"siteKey\" FROM \"Site\" WHERE slug='$SLUG'")
  [ -z "$LIVE_KEY" ] || [ "$LIVE_KEY" = "$SITE_KEY" ] || fail "platform site ownership differs"
  # Transaction + unique dedupe key: retry cannot credit the starting balance twice.
  python3 "$DATA" register "$STATE" "$SITE_DIR/.env" "$PORT" "$DB_CONTAINER" "$PLATFORM_DB"
  unset SITE_KEY LIVE_KEY
  if ! grep -q '^PLATFORM_URL=' "$SITE_DIR/.env"; then printf 'PLATFORM_URL=%s\n' "${PLATFORM_INTERNAL_URL:-http://platform:3000}" >> "$SITE_DIR/.env"; fi
  (cd "$SITE_DIR" && docker compose up -d app)
  mark platform
fi
# Read-only smoke: no unsolicited order, external message or direct status rewrite.
for attempt in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/" -o /dev/null 2>/dev/null && break; sleep 1; done
curl -fsS "http://127.0.0.1:$PORT/" -o /dev/null
curl -fsS "http://127.0.0.1:$PORT/content-asset/icons/icon-192.png" -o /dev/null
# Exercise the new app's actual DB credentials against an existing tenant table.
# Permission denial is expected; network/SQL errors are not accepted as proof.
ISOLATION_JS=$(cat <<'JS'
const {Client}=require('pg');
(async()=>{const u=new URL(process.env.DATABASE_URL);u.pathname='/'+process.env.NEIGHBOR_DB;
const c=new Client({connectionString:u.href});try{await c.connect();await c.query('SELECT 1 FROM "Order" LIMIT 1');console.log('ALLOWED')}
catch(e){if(e.code==='42501')console.log('DENIED');else process.exitCode=1}finally{await c.end()}})();
JS
)
CHECKED=0
NEIGHBORS=$(dpsql -d postgres -Atc "SELECT datname FROM pg_database WHERE datname NOT IN ('$SLUG','$PLATFORM_DB','postgres','template0','template1')")
while IFS= read -r neighbor; do
  [[ "$neighbor" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || continue
  if [ "$(dpsql -d "$neighbor" -Atc "SELECT to_regclass('\"Order\"') IS NOT NULL")" = t ]; then
    RESULT=$(docker run --rm --network template_default --env-file "$SITE_DIR/.env" -e NEIGHBOR_DB="$neighbor" "$MIGRATOR" node -e "$ISOLATION_JS") || fail "DB isolation check failed"
    [ "$RESULT" = DENIED ] || fail "new role can read another tenant; publication stopped"
    CHECKED=$((CHECKED + 1))
  fi
done <<< "$NEIGHBORS"
log "neighbor DB permission checks: $CHECKED (zero means no eligible neighbor)"
as_root env RESTO_BASE="$BASE" DB_CONTAINER="$DB_CONTAINER" PLATFORM_DB="$PLATFORM_DB" CADDYFILE="$CADDYFILE" "$SRC/scripts/sync-caddy.sh"
for attempt in $(seq 1 12); do curl -fsS "https://$DOMAIN/" -o /dev/null 2>/dev/null && break; sleep 5; done
curl -fsS "https://$DOMAIN/" -o /dev/null
mark complete
log "published: https://$DOMAIN — admin: https://$DOMAIN/admin"
log "owner credentials are in $SITE_DIR/.env (600); values are not printed"
