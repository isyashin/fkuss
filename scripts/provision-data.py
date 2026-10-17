#!/usr/bin/env python3
"""Validate a publication archive and keep the ownership journal (no secrets)."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import uuid
from urllib.parse import urlsplit

FILES = {"restaurant.json", "menu.json", "settings.json", "theme.json", "pages.json", "promos.json", "site-input.json", "source-report.json"}
REQUIRED = FILES
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


class PublicationError(ValueError):
    pass


def archive_data(archive, slug):
    if not SLUG.fullmatch(slug) or len(slug) > 58:
        raise PublicationError("invalid slug")
    files, total = {}, 0
    with tarfile.open(archive, "r:gz") as source:
        for member in source:
            raw = member.name
            while raw.startswith("./"):
                raw = raw[2:]
            name = PurePosixPath(raw)
            if name.is_absolute() or ".." in name.parts or "\\" in raw or not name.parts or name.parts[0] != "content":
                raise PublicationError("archive path escapes content")
            relative = name.relative_to("content")
            parts = relative.parts
            if member.isdir():
                if parts and parts[0] not in {"images", "icons"}:
                    raise PublicationError("unexpected directory")
                continue
            if not member.isfile() or any(part.startswith(".") for part in parts):
                raise PublicationError("links, special files and hidden files are forbidden")
            allowed = len(parts) == 1 and str(relative) in FILES
            allowed = allowed or len(parts) > 1 and parts[0] in {"images", "icons"} and name.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}
            allowed = allowed or str(relative) == "icons/icons.json"
            if not allowed or str(relative) in files:
                raise PublicationError("unexpected or duplicate archive file")
            total += member.size
            if total > 512 * 1024 * 1024 or len(files) >= 20_000:
                raise PublicationError("archive is too large")
            files[str(relative)] = source.extractfile(member).read()
    if not REQUIRED.issubset(files):
        raise PublicationError("archive is missing required content JSON")
    manifest = json.loads(files["site-input.json"].decode("utf-8-sig"))
    identity = manifest["identity"]
    if not isinstance(identity.get("name"), str) or not identity["name"].strip():
        raise PublicationError("identity.name is required")
    if identity["slug"] != slug or not isinstance(manifest.get("approvedBy"), str) or not manifest["approvedBy"].strip():
        raise PublicationError("slug mismatch or missing approvedBy")
    url = urlsplit(identity["domain"])
    labels = (url.hostname or "").split(".")
    if url.scheme != "https" or url.username or url.password or url.port or url.path not in {"", "/"} or url.query or url.fragment or not all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels):
        raise PublicationError("canonical domain must be a plain HTTPS origin")
    restaurant = json.loads(files["restaurant.json"].decode("utf-8-sig"))
    settings = json.loads(files["settings.json"].decode("utf-8-sig"))
    if restaurant["slug"] != slug or settings["domains"]["canonical"].rstrip("/") != identity["domain"].rstrip("/"):
        raise PublicationError("manifest and content identity differ")
    platform = manifest.get("platform", {})
    if not re.fullmatch(r"[^\s@'\"]+@[^\s@'\"]+\.[^\s@'\"]+", platform.get("ownerEmail", "")) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", platform.get("tariffId", "")):
        raise PublicationError("platform.ownerEmail and platform.tariffId are required")
    credit = platform.get("initialKopecks")
    if type(credit) is not int or not 0 <= credit <= 2_147_483_647:
        raise PublicationError("platform.initialKopecks must be an explicit nonnegative integer")
    report = json.loads(files.get("source-report.json", b"{}"))
    if not manifest.get("decisions", {}).get("publishWithGaps", True) and (manifest.get("decisions", {}).get("gaps") or report.get("unresolved")):
        raise PublicationError("unresolved gaps are forbidden by the manifest")
    digest = hashlib.sha256()
    for name, data in sorted(files.items()):
        digest.update(name.encode() + b"\0" + hashlib.sha256(data).digest())
    return files, {"version": 1, "slug": slug, "domain": url.hostname, "name": identity["name"], "contentHash": digest.hexdigest(),
        "ownerEmail": platform["ownerEmail"], "tariffId": platform["tariffId"], "initialKopecks": credit}


def save(path, data):
    path = Path(path)
    if path.is_symlink():
        raise PublicationError("journal cannot be a symlink")
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("x", encoding="utf8") as output:
        os.chmod(temporary, 0o600)
        json.dump(data, output, ensure_ascii=False)
    temporary.replace(path)


def owned(path, slug, site_dir):
    path = Path(path)
    if path.is_symlink():
        raise PublicationError("journal cannot be a symlink")
    data = json.loads(path.read_text(encoding="utf8"))
    if data.get("version") != 1 or data.get("slug") != slug or data.get("siteDir") != str(Path(site_dir).resolve()) or not re.fullmatch(r"[0-9a-f]{32}", data.get("publicationId", "")):
        raise PublicationError("publication does not own this site")
    return data


def site_key(path):
    values = [line.split("=", 1)[1] for line in Path(path).read_text().splitlines() if line.startswith("SITE_KEY=")]
    if len(values) != 1 or not re.fullmatch(r"[a-f0-9]{64}", values[0]):
        raise PublicationError("invalid site key in private env")
    return values[0]


def registration_sql(data, port, key):
    slug, publication = data["slug"], data["publicationId"]
    credit = data["initialKopecks"]
    if not SLUG.fullmatch(slug) or not re.fullmatch(r"[a-f0-9]{32}", publication) or not re.fullmatch(r"[a-f0-9]{64}", key):
        raise PublicationError("invalid registration identity")
    if type(credit) is not int or not 0 <= credit <= 2_147_483_647 or type(port) is not int or not 1 <= port <= 65535:
        raise PublicationError("invalid registration amount or port")
    def quote(value):
        return "'" + str(value).replace("'", "''") + "'"
    s, k, email = quote(slug), quote(key), quote(data["ownerEmail"])
    guard = f'''BEGIN
      IF EXISTS (SELECT 1 FROM "Site" WHERE slug={s} AND "siteKey"<>{k}) THEN
        RAISE EXCEPTION 'site ownership changed'; END IF;
      IF EXISTS (SELECT 1 FROM "OwnerAccount" WHERE email={email} AND "siteId"<>{s}) THEN
        RAISE EXCEPTION 'owner email belongs to another site'; END IF;
      END'''
    return f'''BEGIN;
      SELECT pg_advisory_xact_lock(hashtext({quote('provision:' + slug)})::bigint);
      DO {quote(guard)};
      INSERT INTO "Site" (slug,name,port,domains,"siteKey","tariffId")
        VALUES ({s},{quote(data['name'])},{port},ARRAY[{quote(data['domain'])}],{k},{quote(data['tariffId'])})
        ON CONFLICT (slug) DO NOTHING;
      INSERT INTO "OwnerAccount" (id,email,"siteId")
        VALUES ({quote('provision-' + publication)},{email},{s}) ON CONFLICT (email) DO NOTHING;
      INSERT INTO "BalanceTransaction" (id,"siteId",type,amount,"dedupeKey",comment)
        SELECT {quote('provision-' + publication)},{s},'topup',{credit},
        {quote('provision:' + publication + ':initial')},'Reviewed initial credit' WHERE {credit}>0
        ON CONFLICT ("dedupeKey") DO NOTHING;
      COMMIT;'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["extract", "start", "owned", "get", "done", "mark", "register"])
    parser.add_argument("args", nargs="+")
    options = parser.parse_args()
    command, args = options.command, options.args
    if command == "extract":
        archive, slug, destination = args
        files, metadata = archive_data(archive, slug)
        root = Path(destination)
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        for name, data in files.items():
            target = root / "content" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as output:
                output.write(data)
        save(root / "metadata.json", metadata)
    elif command == "start":
        state, metadata_path, site_dir = args
        metadata = json.loads(Path(metadata_path).read_text(encoding="utf8"))
        if Path(state).exists():
            previous = owned(state, metadata["slug"], site_dir)
            if previous["contentHash"] != metadata["contentHash"]:
                raise PublicationError("existing publication has different content; reseed refused")
        else:
            save(state, {**metadata, "siteDir": str(Path(site_dir).resolve()), "publicationId": uuid.uuid4().hex, "stages": []})
    elif command == "register":
        state, env_file, port, container, database = args
        if not re.fullmatch(r"[a-zA-Z0-9_.-]+", container) or not re.fullmatch(r"[a-zA-Z0-9_-]+", database):
            raise PublicationError("invalid platform target")
        sql = registration_sql(json.loads(Path(state).read_text(encoding="utf8")), int(port), site_key(env_file))
        result = subprocess.run(["docker", "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "resto", "-d", database],
            input=sql, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError("platform registration failed")
    elif command == "owned":
        owned(*args)
    else:
        state, key = args
        data = json.loads(Path(state).read_text(encoding="utf8"))
        if command == "get":
            value = data[key]
            print(value if isinstance(value, (str, int)) else json.dumps(value))
        elif command == "done":
            raise SystemExit(0 if key in data.get("stages", []) else 1)
        elif command == "mark":
            if key not in data["stages"]:
                data["stages"].append(key)
            save(state, data)


if __name__ == "__main__":
    try:
        main()
    except PublicationError as error:
        raise SystemExit(f"Publication refused: {error}")
    except (ValueError, KeyError, TypeError, AttributeError, UnicodeError, OSError, RuntimeError, tarfile.TarError):
        raise SystemExit("Publication input/journal validation failed; no secret values printed")
