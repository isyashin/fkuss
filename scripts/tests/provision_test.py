import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "provision-data.py"
spec = importlib.util.spec_from_file_location("provision_data", SCRIPT)
data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(data)


class ArchiveTest(unittest.TestCase):
    def fixture(self, directory, extra=None, manifest_patch=None):
        manifest = {"identity": {"slug": "qa-cafe", "name": "QA", "domain": "https://qa-cafe.example.test"},
            "approvedBy": "QA review", "platform": {"ownerEmail": "owner@example.test", "tariffId": "standard", "initialKopecks": 12345}}
        if manifest_patch:
            manifest.update(manifest_patch)
        content = {name: b"{}" for name in data.REQUIRED}
        content.update({"site-input.json": json.dumps(manifest).encode(), "restaurant.json": b'{"slug":"qa-cafe"}',
            "settings.json": b'{"domains":{"canonical":"https://qa-cafe.example.test"}}'})
        archive = Path(directory, "content.tar.gz")
        with tarfile.open(archive, "w:gz") as out:
            for name, body in content.items():
                member = tarfile.TarInfo("content/" + name); member.size = len(body)
                out.addfile(member, io.BytesIO(body))
            if extra:
                member, body = extra
                out.addfile(member, io.BytesIO(body) if body else None)
        return archive

    def test_valid_archive_preserves_explicit_credit_and_ignores_unknown_platform_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.fixture(directory, manifest_patch={"platform": {"ownerEmail": "owner@example.test", "tariffId": "standard", "initialKopecks": 12345, "slug": "another"}})
            files, meta = data.archive_data(archive, "qa-cafe")
            self.assertEqual(meta["initialKopecks"], 12345)
            self.assertEqual(meta["slug"], "qa-cafe")
            self.assertEqual(len(files), 8)

    def test_archive_refuses_path_traversal_hidden_files_links_and_duplicates(self):
        for name, kind in [("../outside", tarfile.REGTYPE), ("/outside", tarfile.REGTYPE),
                ("content/.env", tarfile.REGTYPE), ("content/images/escape.png", tarfile.SYMTYPE),
                ("content/site-input.json", tarfile.REGTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                member = tarfile.TarInfo(name); member.type = kind; member.linkname = "/outside"
                archive = self.fixture(directory, (member, b""))
                with self.assertRaises(ValueError):
                    data.archive_data(archive, "qa-cafe")

    def test_archive_requires_review_and_matching_slug(self):
        for patch in [{"approvedBy": " "}, {"identity": {"slug": "another", "name": "QA", "domain": "https://qa-cafe.example.test"}}]:
            with self.subTest(patch=patch), tempfile.TemporaryDirectory() as directory:
                archive = self.fixture(directory, manifest_patch=patch)
                with self.assertRaises(ValueError):
                    data.archive_data(archive, "qa-cafe")

    def test_archive_requires_exact_nonnegative_credit(self):
        for credit in [-1, 1.5, True, 2_147_483_648]:
            with self.subTest(credit=credit), tempfile.TemporaryDirectory() as directory:
                archive = self.fixture(directory, manifest_patch={"platform": {"ownerEmail": "owner@example.test", "tariffId": "standard", "initialKopecks": credit}})
                with self.assertRaises(ValueError):
                    data.archive_data(archive, "qa-cafe")

    def test_corrupt_archive_is_validated_before_any_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            member = tarfile.TarInfo("../outside")
            archive = self.fixture(directory, (member, b""))
            output = Path(directory, "stage")
            result = subprocess.run([sys.executable, str(SCRIPT), "extract", str(archive), "qa-cafe", str(output)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())

    def test_journal_cannot_adopt_another_site_or_reseed_changed_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state, metadata, site = root / "state.json", root / "metadata.json", root / "site"
            meta = {"version": 1, "slug": "qa-cafe", "contentHash": "old"}
            data.save(metadata, meta)
            command = [sys.executable, str(SCRIPT), "start", str(state), str(metadata), str(site)]
            subprocess.run(command, check=True, capture_output=True)
            self.assertEqual(data.owned(state, "qa-cafe", site)["contentHash"], "old")
            with self.assertRaises(ValueError):
                data.owned(state, "qa-cafe", root / "another")
            original = state.read_bytes()
            data.save(metadata, {**meta, "contentHash": "changed"})
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(state.read_bytes(), original)


@unittest.skipIf(os.name == "nt", "Bash/flock guard scenarios run on Linux CI")
class RollbackGuardTest(unittest.TestCase):
    def run_guard(self, case, journal=True, topology=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "src" / "scripts"; source.mkdir(parents=True)
            deploy = source / "deploy.sh"; deploy.write_text("#!/bin/sh\nexit 99\n"); deploy.chmod(0o755)
            caddy = root / "Caddyfile"; caddy.write_text("# resto-site-begin\n# resto-site-end\n")
            state_dir = root / "provisions"; state_dir.mkdir()
            site = root / "sites" / "qa-cafe"; site.mkdir(parents=True)
            (site / "docker-compose.yml").write_text("services: {}")
            if journal:
                data.save(state_dir / "qa-cafe.json", {"version": 1, "slug": "qa-cafe", "siteDir": str(site.resolve()), "publicationId": "a" * 32, "stages": []})
            binary = root / "bin"; binary.mkdir()
            docker = binary / "docker"
            docker.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
args=sys.argv[1:]; root=Path(os.environ['QA_ROOT']); case=os.environ['QA_CASE']
with (root/'calls.jsonl').open('a') as log: log.write(json.dumps(args)+'\\n')
if args and args[0]=='compose':
    if 'stop' in args: (root/'stopped').touch()
    sys.exit(0)
if args and args[0]=='exec':
    sql=next((args[i+1] for i,x in enumerate(args[:-1]) if x in ['-c','-Atc','-tc']), '')
    if 'SELECT pg_get_userbyid' in sql: print('foreign' if case=='foreign' else 'site_qa_cafe')
    elif 'pg_get_userbyid(datdba)' in sql: print(0)
    elif 'pg_database WHERE datname=' in sql: print(1)
    elif 'to_regclass' in sql: print('t' if '"Order"' in sql else 'f')
    elif 'SELECT count(*) FROM "Order"' in sql: print(1 if case=='orders' or case=='race' and (root/'stopped').exists() else 0)
    elif '"Payment"' in sql: print(1 if case=='financial' else 0)
    elif 'SELECT "siteKey" FROM "Site"' in sql: print('')
    elif 'SELECT count(*) FROM "Site"' in sql: print(0)
    else: sys.exit(99)
''')
            docker.chmod(0o755)
            env = {**os.environ, "RESTO_BASE": str(root), "CADDYFILE": str(caddy), "CONFIRM": "YES", "DB_CONTAINER": "fake-db",
                "QA_ROOT": str(root), "QA_CASE": case, "PATH": str(binary) + os.pathsep + os.environ["PATH"]}
            env.pop("RESTO_TOPOLOGY", None)
            if topology: env["RESTO_TOPOLOGY"] = str(root / "topology.json")
            result = subprocess.run(["bash", str(SCRIPT.with_name("provision-site.sh")), "qa-cafe", "--rollback"], env=env, capture_output=True, text=True)
            calls = (root / "calls.jsonl").read_text() if (root / "calls.jsonl").exists() else ""
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertNotIn("DROP ", calls)
            self.assertNotIn("DELETE ", calls)
            if case == "race":
                self.assertIn('"stop", "app"', calls)
                self.assertIn('"up", "-d", "app"', calls)
            else:
                self.assertNotIn('"stop", "app"', calls)

    def test_no_journal_refuses_rollback(self): self.run_guard("empty", journal=False)
    def test_existing_orders_refuse_rollback(self): self.run_guard("orders")
    def test_changed_db_owner_refuses_rollback(self): self.run_guard("foreign")
    def test_financial_history_refuses_rollback(self): self.run_guard("financial")
    def test_late_order_refuses_rollback_and_restarts_app(self): self.run_guard("race")
    def test_explicit_topology_is_refused_before_access(self): self.run_guard("empty", topology=True)


if __name__ == "__main__":
    unittest.main()
