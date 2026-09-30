#!/usr/bin/env python3
"""Consistent SQLite snapshots; only this landing's marked backups are pruned."""
import argparse
import datetime
import json
import os
import pathlib
import re
import shutil
import sqlite3
import uuid
from contextlib import closing


def backup(database, admin, output, keep=14):
    database, admin, output = (pathlib.Path(path).resolve() for path in (database, admin, output))
    if not database.is_file() or not admin.is_file():
        raise ValueError("Landing database and admin configuration must exist")
    if output == database.parent or output in database.parents or output == admin.parent or output in admin.parents:
        raise ValueError("Backups must be outside the source directory")
    if not 1 <= keep <= 90:
        raise ValueError("Retention must be between 1 and 90")
    os.umask(0o077)
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    identity = uuid.uuid4().hex[:8]
    created = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    staging = output / (".partial-" + identity)
    final = output / ("landing-" + created + "-" + identity)
    staging.mkdir(mode=0o700)
    try:
        with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=10)) as source:
            with closing(sqlite3.connect(staging / "leads.db")) as destination:
                source.backup(destination, pages=256, sleep=0.01)
                if destination.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise RuntimeError("Landing snapshot verification failed")
        os.chmod(staging / "leads.db", 0o600)
        shutil.copyfile(admin, staging / "admin.json")
        os.chmod(staging / "admin.json", 0o600)
        (staging / "manifest.json").write_text(json.dumps({"kind":"fkuss-landing-backup","createdAt":created,"version":1}) + "\n")
        staging.rename(final)
    except Exception:
        if staging.parent == output and staging.is_dir() and not staging.is_symlink():
            shutil.rmtree(staging)
        raise
    candidates = []
    for path in output.iterdir():
        if path.is_symlink() or not path.is_dir() or not re.fullmatch(r"landing-\d{4}-\d{2}-\d{2}T\d{6}Z-[a-f0-9]{8}", path.name):
            continue
        try:
            if json.loads((path / "manifest.json").read_text()).get("kind") == "fkuss-landing-backup":
                candidates.append(path)
        except (OSError, ValueError):
            continue
    candidates.sort(key=lambda path: (path.stat().st_mtime_ns, path.name), reverse=True)
    pruned = 0
    for path in candidates[keep:]:
        if path.parent != output or path.is_symlink():
            raise RuntimeError("Unsafe landing backup path")
        shutil.rmtree(path)
        pruned += 1
    return {"backup":final.name, "verified":True, "pruned":pruned}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--admin", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--keep", type=int, default=14)
    args = parser.parse_args()
    print(json.dumps(backup(args.database, args.admin, args.out, args.keep)))
