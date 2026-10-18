#!/usr/bin/env python3
"""Build immutable main images with a disk reserve, without deploying anything."""
import argparse
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time

GIB = 1024 ** 3


def require_space(directory, minimum):
    free = shutil.disk_usage(directory).free
    if free < minimum:
        raise RuntimeError(f"Insufficient disk space: {free / GIB:.1f} GiB free, {minimum / GIB:.1f} GiB required")


def guarded_build(command, directory, *, start_free=8 * GIB, reserve=2 * GIB):
    require_space(directory, start_free)
    process = subprocess.Popen(command, start_new_session=True)
    try:
        while process.poll() is None:
            require_space(directory, reserve)
            time.sleep(1)
        if process.returncode:
            raise RuntimeError(f"Image build failed (exit {process.returncode})")
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGINT)
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=15)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()
    def git(*options):
        return subprocess.check_output(["git", "-C", str(args.source), *options], text=True).strip()
    sha = git("rev-parse", "HEAD")
    if sha != args.revision or sha != git("rev-parse", "origin/main") or git("status", "--porcelain"):
        raise RuntimeError("Build requires a clean checkout of the specified origin/main revision")
    docker_root = subprocess.check_output(["docker", "info", "--format", "{{.DockerRootDir}}"], text=True).strip()
    # Both source and Docker storage must retain space (they may be different mounts).
    require_space(args.source, 8 * GIB)
    require_space(docker_root, 8 * GIB)
    for folder, image in [("template", "resto-template"), ("platform", "fkuss-platform")]:
        for target in [None, "migrator"]:
            tag = image + ("-migrator" if target else "") + ":release-" + sha[:12]
            command = ["docker", "build", "--label", "org.opencontainers.image.revision=" + sha, "-t", tag]
            if target:
                command += ["--target", target]
            guarded_build(command + [str(args.source / folder)], docker_root, start_free=2 * GIB)
            actual = subprocess.check_output(["docker", "image", "inspect", "--format", '{{index .Config.Labels "org.opencontainers.image.revision"}}', tag], text=True).strip()
            if actual != sha:
                raise RuntimeError("Built image revision mismatch")
        # Keep final/rollback images; only unused build cache is reclaimable.
        # Otherwise two complete Node build trees coexist on a small dev disk.
        subprocess.run(["docker", "builder", "prune", "--force", "--keep-storage", "256MB"], check=True)


if __name__ == "__main__":
    main()
