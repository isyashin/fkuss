#!/usr/bin/env python3
"""Operations for an explicit topology (separate tenant DBs or shared PostgreSQL).

No credentials in the JSON: DB connection metadata is read inside Docker,
application secrets stay in env files. See docs/TOPOLOGY-OPERATIONS.md.
"""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
import secrets
import shutil
import subprocess
import tempfile
import time

SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,57}$")
DOMAIN = re.compile(r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")
BEGIN, END = "# fkuss-topology-begin", "# fkuss-topology-end"


def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True, text=True)
    if result.returncode:
        # A failed SQL/compose command can contain credentials. Never echo it.
        raise RuntimeError(f"{Path(args[0]).name} failed (exit {result.returncode})")
    return result.stdout


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def load_config(path):
    config = json.loads(Path(path).read_text())
    if config.get("version") != 1 or not config.get("sites"):
        raise ValueError("version=1 and a nonempty sites list are required")
    for key in ["baseDir", "sourceDir"]:
        if not Path(config[key]).is_absolute():
            raise ValueError(f"{key} must be absolute")
    slugs, ports, domains = set(), set(), set()
    tariff = config["tariff"]
    if not SLUG.fullmatch(tariff["id"]) or any(type(tariff[key]) is not int or not 0 <= tariff[key] <= 2_147_483_647 for key in ["monthlyPrice", "initialKopecks"]):
        raise ValueError("invalid tariff or starting balance")
    public = urlsplit(config["platform"]["publicUrl"])
    if public.scheme not in {"http", "https"} or not public.hostname or public.username or public.password or any(c in config["platform"]["publicUrl"] for c in "\r\n"):
        raise ValueError("invalid platform public URL")
    for item in [config["platform"], *config["sites"]]:
        if not isinstance(item["port"], int) or not 1 <= item["port"] <= 65535 or item["port"] in ports:
            raise ValueError("invalid or duplicate port")
        ports.add(item["port"])
        for key in ["composeDir", "envFile"]:
            if not Path(item[key]).is_absolute():
                raise ValueError(f"{key} must be absolute")
        for key in ["appContainer", "dbContainer"]:
            if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", item[key]):
                raise ValueError(f"invalid {key}")
        for domain in item["domains"]:
            if not DOMAIN.fullmatch(domain) or ".." in domain or domain in domains:
                raise ValueError("invalid or duplicate domain")
            domains.add(domain)
        for filename in item["composeFiles"]:
            if Path(filename).name != filename:
                raise ValueError("composeFiles must be basenames")
        if item is config["platform"]:
            continue
        if not SLUG.fullmatch(item["slug"]) or item["slug"] in slugs:
            raise ValueError("invalid or duplicate slug")
        slugs.add(item["slug"])
        if not Path(item["contentDir"]).is_absolute():
            raise ValueError("contentDir must be absolute")
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", item["ownerEmail"]):
            raise ValueError("ownerEmail is required")
    return config


def inspect_env(container):
    values = json.loads(run(["docker", "inspect", "--format", "{{json .Config.Env}}", container]))
    return dict(value.split("=", 1) for value in values if "=" in value)


def db_args(item, command="psql"):
    env = inspect_env(item["dbContainer"])
    user = item.get("dbUser", env.get("POSTGRES_USER", "postgres"))
    database = item.get("dbName", env.get("POSTGRES_DB", user))
    args = ["docker", "exec", "-i", item["dbContainer"], command, "-U", user, "-d", database]
    return args + (["-X", "-v", "ON_ERROR_STOP=1", "-At"] if command == "psql" else [])


def query(item, sql):
    return run(db_args(item), sql).strip()


def read_env(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            result[key] = value.strip().strip('"').strip("'")
    return result


def write_env(path, changes):
    path = Path(path)
    if path.is_symlink():
        raise ValueError("env file cannot be a symlink")
    original = path.read_text()
    lines, remaining = [], dict(changes)
    for line in original.splitlines():
        key = line.split("=", 1)[0]
        if key in changes:
            if key in remaining:
                lines.append(f"{key}={remaining.pop(key)}")
        else:
            lines.append(line)
    lines.extend(f"{key}={value}" for key, value in remaining.items())
    updated = "\n".join(lines) + "\n"
    if updated == original:
        return
    backup = path.with_name(path.name + ".before-topology")
    if not backup.exists():
        shutil.copy2(path, backup)
        backup.chmod(0o600)
    temporary = path.with_name(path.name + ".topology-tmp")
    temporary.write_text(updated)
    temporary.chmod(0o600)
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        stat = path.stat()
        os.chown(temporary, stat.st_uid, stat.st_gid)
    os.replace(temporary, path)


def register(config):
    """Idempotent registration; does not restart apps or change menu/settings."""
    platform = config["platform"]
    tariff = config["tariff"]
    query(platform, f'''INSERT INTO "Tariff" (id,name,"monthlyPrice") VALUES
      ({sql_value(tariff['id'])},{sql_value(tariff['name'])},{int(tariff['monthlyPrice'])}) ON CONFLICT (id) DO NOTHING;''')
    networks = {}
    for site in config["sites"]:
        slug = site["slug"]
        previous = query(platform, f'''SELECT json_build_object('key',"siteKey") FROM "Site" WHERE slug={sql_value(slug)};''')
        env = read_env(site["envFile"])
        runtime = inspect_env(site["appContainer"])
        key = json.loads(previous)["key"] if previous else env.get("SITE_KEY") or secrets.token_hex(32)
        owner_id = "topology-" + hashlib.sha256(site["ownerEmail"].encode()).hexdigest()[:24]
        owner_site = query(platform, f'''SELECT "siteId" FROM "OwnerAccount" WHERE email={sql_value(site['ownerEmail'])};''')
        if owner_site and owner_site != slug:
            raise ValueError("owner email belongs to another site")
        domains = "ARRAY[" + ",".join(sql_value(d) for d in site["domains"]) + "]::text[]"
        query(platform, f'''BEGIN;
          INSERT INTO "Site" (slug,name,port,domains,"siteKey","tariffId","imageVersion","stateChangedAt","createdAt")
          VALUES ({sql_value(slug)},{sql_value(site['name'])},{site['port']},{domains},{sql_value(key)},
          {sql_value(tariff['id'])},{sql_value(runtime.get('RELEASE_REVISION',''))},NOW(),NOW())
          ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,port=EXCLUDED.port,domains=EXCLUDED.domains;
          INSERT INTO "OwnerAccount" (id,email,"siteId","createdAt")
          VALUES ({sql_value(owner_id)},{sql_value(site['ownerEmail'])},{sql_value(slug)},NOW())
          ON CONFLICT (email) DO NOTHING;
          INSERT INTO "BalanceTransaction" (id,"siteId",type,amount,"dedupeKey",comment,"createdAt")
          SELECT {sql_value('topology-initial-'+slug)},{sql_value(slug)},'topup',{int(tariff['initialKopecks'])},
          {sql_value('topology:initial:'+slug)},'Стартовый баланс при подключении',NOW()
          WHERE NOT EXISTS (SELECT 1 FROM "BalanceTransaction" WHERE "siteId"={sql_value(slug)})
          ON CONFLICT ("dedupeKey") DO NOTHING;
          COMMIT;''')
        owner_site = query(platform, f'''SELECT "siteId" FROM "OwnerAccount" WHERE email={sql_value(site['ownerEmail'])};''')
        if owner_site != slug:
            raise ValueError("owner email belongs to another site")
        write_env(site["envFile"], {
            "SITE_KEY": key, "PLATFORM_URL": "http://fkuss-platform:3000",
            "PLATFORM_PUBLIC_URL": platform["publicUrl"],
            "CRON_SECRET": env.get("CRON_SECRET") or runtime.get("CRON_SECRET") or secrets.token_hex(32),
        })
        network = "fkuss-service-" + slug
        if not run(["docker", "network", "ls", "--filter", "name=^" + network + "$", "--format", "{{.Name}} "]).strip():
            run(["docker", "network", "create", "--internal", network])
        networks[network] = {"external": True, "name": network}
        override = {"services": {"app": {"networks": {"default": {}, "service": {"aliases": [slug + "-app-1"]}}}}, "networks": {"service": {"external": True, "name": network}}}
        Path(site["composeDir"], "fkuss-services.json").write_text(json.dumps(override, indent=2) + "\n")
        print(f"registered: {slug}")
    override = {"services": {"app": {"networks": {"default": {}, **{key: {"aliases": ["fkuss-platform"]} for key in networks}},
        "volumes": [str(Path(config['baseDir'], 'backups/export')) + ":/app/exports:ro"]}}, "networks": networks}
    Path(platform["composeDir"], "fkuss-services.json").write_text(json.dumps(override, indent=2) + "\n")
    env = read_env(platform["envFile"])
    runtime = inspect_env(platform["appContainer"])
    write_env(platform["envFile"], {"EXPORT_DIR": "/app/exports", "CRON_SECRET": env.get("CRON_SECRET") or runtime.get("CRON_SECRET") or secrets.token_hex(32)})
    export_dir(config)


@contextlib.contextmanager
def lock(config, name):
    import fcntl
    base = Path(config["baseDir"])
    base.mkdir(parents=True, exist_ok=True)
    with (base / (name + ".lock")).open("w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def dump_database(item, destination):
    with Path(destination).open("wb") as output:
        process = subprocess.run(db_args(item, "pg_dump") + ["-Fc"], stdout=output, stderr=subprocess.PIPE)
    if process.returncode:
        raise RuntimeError("database backup failed: " + item["dbContainer"])
    Path(destination).chmod(0o600)


def backup(config):
    with lock(config, "backup"):
        root = Path(config["baseDir"], "backups")
        root.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix=".partial-", dir=root))
        try:
            (staging / "topology.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n")
            (staging / "topology.json").chmod(0o600)
            caddy = Path(config.get("caddyFile", "/etc/caddy/Caddyfile"))
            if caddy.is_file():
                shutil.copy2(caddy, staging / "Caddyfile")
            manifest = {"version": 1, "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(), "sites": []}
            for item in [config["platform"], *config["sites"]]:
                slug = item.get("slug", "platform")
                deployment = staging / "deployment" / slug
                deployment.mkdir(parents=True, mode=0o700)
                for name in [*item["composeFiles"], "fkuss-services.json", "release-preprod.json"]:
                    source = Path(item["composeDir"], name)
                    if source.is_file():
                        shutil.copy2(source, deployment / name)
                dump_database(item, staging / (slug + ".dump"))
                shutil.copy2(item["envFile"], staging / (slug + ".env"))
                (staging / (slug + ".env")).chmod(0o600)
                if "contentDir" in item:
                    content = Path(item["contentDir"])
                    run(["tar", "-czf", str(staging / (slug + "-content.tar.gz")), "-C", str(content.parent), content.name])
                manifest["sites"].append(slug)
            (staging / "topology-manifest.json").write_text(json.dumps(manifest, indent=2))
            destination = root / ("release-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S-%f"))
            staging.rename(destination)
            # Only completed snapshots made by this tool; never rotate exports/unrelated dirs.
            snapshots = sorted(p for p in root.glob("release-*") if p.is_dir() and (p / "topology-manifest.json").is_file())
            for old in snapshots[:-14]:
                if old.parent.resolve() != root.resolve() or old.is_symlink():
                    raise ValueError("unsafe backup rotation path")
                shutil.rmtree(old)
            print("BACKUP_PATH=" + str(destination))
            return destination
        finally:
            if staging.exists():
                shutil.rmtree(staging)


def export_dir(config):
    directory = Path(config["baseDir"], "backups/export")
    directory.mkdir(parents=True, exist_ok=True)
    # Only the platform app's UID/GID reads completed files. No public static directory.
    if os.geteuid() == 0:
        os.chown(directory, 100, 101)
    directory.chmod(0o750)
    return directory


def export_site(config, slug):
    site = next(item for item in config["sites"] if item["slug"] == slug)
    directory = export_dir(config)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
    destination = directory / f"{slug}-{stamp}.tar.gz"
    if destination.exists():
        raise RuntimeError("export already created this second; retry later")
    with tempfile.TemporaryDirectory(prefix=".partial-", dir=directory) as temp:
        temp = Path(temp)
        shutil.copytree(site["contentDir"], temp / "content", symlinks=True)
        # Portable plain SQL, compatible with the existing customer export format.
        with (temp / "database.sql").open("wb") as output:
            result = subprocess.run(db_args(site, "pg_dump"), stdout=output, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError("export database dump failed")
        partial = directory / (destination.name + ".partial")
        try:
            run(["tar", "-czf", str(partial), "-C", str(temp), "."])
            partial.chmod(0o640)
            if os.geteuid() == 0:
                os.chown(partial, 100, 101)
            os.replace(partial, destination)
        finally:
            partial.unlink(missing_ok=True)
    return destination


def process_exports(config):
    with lock(config, "exports"):
        platform = config["platform"]
        directory = export_dir(config)
        query(platform, '''UPDATE "Site" SET "exportRequestedAt"=NULL,"exportReadyPath"=NULL,"exportReadyAt"=NULL,"exportExpiresAt"=NULL
            WHERE "exportReadyPath" IS NOT NULL AND ("exportExpiresAt" IS NULL OR "exportExpiresAt" <= NOW());''')
        requests = query(platform, '''SELECT COALESCE(json_agg(x),'[]') FROM
            (SELECT slug,"exportRequestedAt"::text AS requested FROM "Site" WHERE "exportRequestedAt" IS NOT NULL AND "exportReadyPath" IS NULL) x;''')
        for item in json.loads(requests):
            if not any(site["slug"] == item["slug"] for site in config["sites"]):
                continue
            archive = export_site(config, item["slug"])
            # A newer request must not inherit a result of an older generation.
            query(platform, f'''UPDATE "Site" SET "exportReadyPath"={sql_value(archive.name)},"exportReadyAt"=NOW(),"exportExpiresAt"=NOW()+INTERVAL '24 hours'
                WHERE slug={sql_value(item['slug'])} AND "exportRequestedAt"={sql_value(item['requested'])}::timestamp AND "exportReadyPath" IS NULL;''')
            print("export ready: " + item["slug"])
        for file in directory.glob("*.tar.gz"):
            if not file.is_symlink() and time.time() - file.stat().st_mtime > 24 * 3600:
                file.unlink()


def strip_owned_blocks(text, domains, adopt=False):
    """Remove only marker-owned blocks. Adoption refuses mixed/unknown aliases."""
    if text.count(BEGIN) != text.count(END) or text.count(BEGIN) > 1:
        raise ValueError("invalid topology markers")
    text = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\s*", "", text, flags=re.S)
    lines, output, index = text.splitlines(keepends=True), [], 0
    while index < len(lines):
        line = lines[index]
        header = line.strip().removesuffix("{").strip()
        addresses = {part.strip(",") for part in header.split()}
        if not line.rstrip().endswith("{") or not addresses.intersection(domains):
            output.append(line)
            index += 1
            continue
        if not adopt or not addresses.issubset(domains):
            raise ValueError("unmanaged tenant domain/alias; review config and use adopt-caddy once")
        depth = 0
        while index < len(lines):
            # Braces in quoted response text and comments are not block delimiters.
            structural = re.sub(r'"(?:\\.|[^"\\])*"|#[^\n]*', '', lines[index])
            depth += structural.count("{") - structural.count("}")
            index += 1
            if depth == 0:
                break
        if depth:
            raise ValueError("unbalanced Caddy block")
    return "".join(output).rstrip() + "\n\n"


def render_caddy(text, sites, adopt=False):
    domains = {domain for site in sites for domain in site["domains"]}
    output = strip_owned_blocks(text, domains, adopt) + BEGIN + "\n"
    for site in sites:
        if site["state"] not in {"active", "grace", "suspended"}:
            raise ValueError("unknown site state")
        for domain in site["domains"]:
            output += domain + " {\n"
            output += ('    respond "Сайт временно недоступен" 503\n' if site["state"] == "suspended"
                else f'    reverse_proxy 127.0.0.1:{site["port"]}\n')
            output += "}\n\n"
    return output + END + "\n"


def sync_caddy(config, adopt=False):
    with lock(config, "caddy"):
        data = query(config["platform"], '''SELECT COALESCE(json_agg(x),'[]') FROM (SELECT slug,state,port,domains FROM "Site" ORDER BY slug) x;''')
        registered = {site["slug"]: site for site in json.loads(data)}
        sites = []
        for expected in config["sites"]:
            site = registered.get(expected["slug"])
            if not site or site["port"] != expected["port"] or set(site["domains"]) != set(expected["domains"]):
                raise ValueError("platform registry and topology differ")
            sites.append(site)
        path = Path(config.get("caddyFile", "/etc/caddy/Caddyfile"))
        original = path.read_text()
        rendered = render_caddy(original, sites, adopt)
        if rendered == original:
            print("Caddy unchanged")
            return
        fd, name = tempfile.mkstemp(prefix=path.name + ".topology-", dir=path.parent)
        os.close(fd)
        stage = Path(name)
        try:
            stage.write_text(rendered)
            stage.chmod(0o644)
            run(["caddy", "validate", "--config", str(stage), "--adapter", "caddyfile"])
            previous = path.with_name(path.name + ".before-topology")
            shutil.copy2(path, previous)
            os.replace(stage, path)
            try:
                run(["systemctl", "reload", "caddy"])
            except RuntimeError:
                shutil.copy2(previous, path)
                run(["systemctl", "reload", "caddy"])
                raise
            print("Caddy updated and validated")
        finally:
            stage.unlink(missing_ok=True)


def reconcile_preorder(config, slug):
    """Only the known missing 0013 history with exactly matching physical DDL."""
    site = next(item for item in config["sites"] if item["slug"] == slug)
    directory = Path(config["sourceDir"], "template/prisma/migrations")
    expected = {name: {"name": name, "type": "text", "nullable": "YES", "default": None}
        for name in ["preOrderDate", "preOrderTime", "preOrderTz"]}
    columns = json.loads(query(site, '''SELECT COALESCE(json_agg(x),'[]') FROM
        (SELECT column_name AS name,data_type AS type,is_nullable AS nullable,column_default AS "default"
         FROM information_schema.columns WHERE table_schema='public' AND table_name='Order'
         AND column_name IN ('preOrderDate','preOrderTime','preOrderTz')) x;'''))
    if {column["name"]: column for column in columns} != expected:
        raise ValueError("physical preorder columns differ; migration resolve refused")
    rows = json.loads(query(site, '''SELECT COALESCE(json_agg(x),'[]') FROM
        (SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations") x;'''))
    applied = {row["migration_name"]: row for row in rows if row["finished_at"] and not row["rolled_back_at"]}
    migration = "0013_preorder_absolute_time"
    if migration in applied:
        print("0013 already applied: " + slug)
        return
    if any(not row["finished_at"] and not row["rolled_back_at"] for row in rows):
        raise ValueError("unfinished migration exists; investigate before reconciliation")
    for path in directory.glob("*/migration.sql"):
        if path.parent.name >= migration:
            continue
        row = applied.get(path.parent.name)
        if not row or row["checksum"] != hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError("earlier migration history differs; resolve refused")
    expected_sql = '\n'.join(f'ALTER TABLE "Order" ADD COLUMN "{name}" TEXT;' for name in expected)
    if (directory / migration / "migration.sql").read_text().strip() != expected_sql:
        raise ValueError("0013 source differs; resolve refused")
    # Mandatory full snapshot before changing migration metadata; no ALTER/db push.
    backup(config)
    run(["docker", "run", "--rm", "--network", site["dbNetwork"], "--env-file", site["envFile"],
        config["templateMigratorImage"], "npx", "prisma", "migrate", "resolve", "--applied", migration])
    print("0013 history reconciled after DDL and checksum checks: " + slug)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config")
    parser.add_argument("command", choices=["check", "register", "backup", "export", "exports", "caddy", "adopt-caddy", "reconcile-preorder"])
    parser.add_argument("--slug")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    config = load_config(args.config)
    if args.command == "check":
        print(json.dumps({"sites": [site["slug"] for site in config["sites"]], "platformPort": config["platform"]["port"]}))
        return
    if not args.apply:
        parser.error("Mutation requires --apply")
    if args.command == "register":
        register(config)
    elif args.command == "backup":
        backup(config)
    elif args.command == "export":
        print("EXPORT_PATH=" + str(export_site(config, args.slug)))
    elif args.command == "exports":
        process_exports(config)
    elif args.command == "reconcile-preorder":
        reconcile_preorder(config, args.slug)
    else:
        sync_caddy(config, adopt=args.command == "adopt-caddy")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, OSError) as error:
        print(f"Operation failed: {type(error).__name__}: {error}", file=__import__('sys').stderr)
        raise SystemExit(1)
