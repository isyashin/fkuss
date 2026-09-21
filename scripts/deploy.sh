#!/usr/bin/env bash
# deploy.sh — деплой сайта ресторана на сервер.
# Использование: deploy.sh <slug> [--domain=example.ru]
set -euo pipefail

SLUG="${1:-}"
DOMAIN=""
for arg in "$@"; do
  case "$arg" in
    --domain=*) DOMAIN="${arg#--domain=}" ;;
  esac
done

if [ -z "$SLUG" ]; then
  echo "Использование: deploy.sh <slug> [--domain=example.ru]" >&2
  exit 1
fi

BASE="${RESTO_BASE:-$HOME/resto}"
REGISTRY="$BASE/registry.json"
SITE_DIR="$BASE/sites/$SLUG"
IMAGE="resto-template:latest"
DB_CONTAINER="${DB_CONTAINER:-template-db-1}"

# 1. Реестр: выделяем порт, если сайт новый
PORT=$(python3 - "$REGISTRY" "$SLUG" <<'PY'
import json, sys
path, slug = sys.argv[1], sys.argv[2]
try:
    registry = json.load(open(path))
except FileNotFoundError:
    registry = {}
sites = registry.setdefault("sites", {})
if slug in sites:
    print(sites[slug]["port"])
else:
    used = [s["port"] for s in sites.values()]
    port = max(used, default=3000) + 1
    sites[slug] = {"port": port, "domains": []}
    json.dump(registry, open(path, "w"), indent=2)
    print(port)
PY
)

# 2. Домен (опционально) — добавляем в реестр
if [ -n "$DOMAIN" ]; then
  python3 - "$REGISTRY" "$SLUG" "$DOMAIN" <<'PY'
import json, sys
path, slug, domain = sys.argv[1], sys.argv[2], sys.argv[3]
registry = json.load(open(path))
domains = registry["sites"][slug].setdefault("domains", [])
if domain not in domains:
    domains.append(domain)
json.dump(registry, open(path, "w"), indent=2)
PY
fi

# 3. Пользователь и база сайта (если нет): per-site пользователь с паролем
DB_USER="site_${SLUG//-/_}"
DB_PASS=$(openssl rand -hex 16)
DB_EXISTS=$(docker exec -i "$DB_CONTAINER" psql -U resto -tc "SELECT 1 FROM pg_database WHERE datname='$SLUG'" | tr -d '[:space:]')
if [ "$DB_EXISTS" != "1" ]; then
  docker exec -i "$DB_CONTAINER" psql -U resto <<SQL
CREATE USER "$DB_USER" WITH PASSWORD '$DB_PASS';
CREATE DATABASE "$SLUG" OWNER "$DB_USER";
SQL
else
  DB_PASS="СМОТРИ-СУЩЕСТВУЮЩИЙ-.env"
fi

# 4. Compose сайта
mkdir -p "$SITE_DIR/content"
cat > "$SITE_DIR/docker-compose.yml" <<EOF
services:
  app:
    image: $IMAGE
    ports:
      - "$PORT:3000"
    env_file:
      - .env
    networks:
      - shared
    restart: unless-stopped
    volumes:
      - ./content:/app/content
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
networks:
  shared:
    name: template_default
    external: true
EOF

# 5. .env сайта: свои креды БД + пароль админки (не перезаписываем существующий)
if [ ! -f "$SITE_DIR/.env" ]; then
  if [ "$DB_PASS" = "СМОТРИ-СУЩЕСТВУЮЩИЙ-.env" ]; then
    echo "ОШИБКА: база $SLUG существует, а .env нет — восстанови DATABASE_URL вручную" >&2
    exit 1
  fi
  cat > "$SITE_DIR/.env" <<EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$DB_CONTAINER:5432/$SLUG
ADMIN_PASSWORD=$(openssl rand -hex 12)
CRON_SECRET=$(openssl rand -hex 16)
PLATFORM_PUBLIC_URL=${PLATFORM_PUBLIC_URL:-}
EOF
  chmod 600 "$SITE_DIR/.env"
fi

# 6. Схема БД (миграции) + запуск
echo "== миграция схемы $SLUG =="
SITE_DB_URL=$(grep '^DATABASE_URL=' "$SITE_DIR/.env" | cut -d= -f2-)
docker run --rm --network template_default -e DATABASE_URL="$SITE_DB_URL" resto-template-migrator:latest

cd "$SITE_DIR"
docker compose up -d

echo "✓ $SLUG: порт $PORT, база $SLUG, домены: ${DOMAIN:-субдомен}"
echo "  Не забудь: seed (CONTENT_DIR=$SITE_DIR/content npm run seed) и Caddyfile"
