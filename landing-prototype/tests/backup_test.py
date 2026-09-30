import importlib.util
import json
import pathlib
import shutil
import sqlite3
import tempfile
import unittest
from contextlib import closing

spec = importlib.util.spec_from_file_location("landing_backup", pathlib.Path(__file__).resolve().parents[1] / "ops/backup.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LandingBackupTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="fkuss-landing-backup-test-")
        self.root = pathlib.Path(self.temporary.name).resolve()
        self.source = self.root / "source"
        self.source.mkdir()
        self.database = self.source / "leads.db"
        self.admin = self.source / "admin.json"
        self.admin.write_text(json.dumps({"login":"test-owner","passwordHash":"test-only-hash"}))
        self.connection = sqlite3.connect(self.database)
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("CREATE TABLE leads (id INTEGER PRIMARY KEY, status TEXT, comment TEXT)")
        self.connection.execute("INSERT INTO leads VALUES (1, 'working', 'Saved comment')")
        self.connection.commit()
        self.output = self.root / "backups"

    def tearDown(self):
        self.connection.close()
        if not self.root.is_relative_to(pathlib.Path(tempfile.gettempdir()).resolve()):
            raise RuntimeError("Unsafe test cleanup path")
        self.temporary.cleanup()

    def test_wal_snapshot_restores_leads_status_comments_and_configuration(self):
        result = module.backup(self.database, self.admin, self.output)
        folder = self.output / result["backup"]
        restored = self.root / "restored.db"
        shutil.copyfile(folder / "leads.db", restored)
        with closing(sqlite3.connect(restored)) as db:
            self.assertEqual(db.execute("PRAGMA quick_check").fetchone()[0], "ok")
            self.assertEqual(db.execute("SELECT status, comment FROM leads").fetchone(), ("working","Saved comment"))
        self.assertEqual((folder / "admin.json").read_bytes(), self.admin.read_bytes())
        self.assertTrue(result["verified"])

    def test_retention_preserves_unrelated_folders(self):
        unrelated = self.output / "keep-me"
        unrelated.mkdir(parents=True)
        (unrelated / "file.txt").write_text("preserve")
        for _ in range(3):
            result = module.backup(self.database, self.admin, self.output, keep=2)
        self.assertEqual(result["pruned"], 1)
        self.assertEqual(len(list(self.output.glob("landing-*"))), 2)
        self.assertEqual((unrelated / "file.txt").read_text(), "preserve")

    def test_source_directory_and_invalid_retention_are_rejected(self):
        with self.assertRaises(ValueError):
            module.backup(self.database, self.admin, self.source)
        with self.assertRaises(ValueError):
            module.backup(self.database, self.admin, self.output, keep=0)
        self.assertTrue(self.database.is_file())
        self.assertTrue(self.admin.is_file())


if __name__ == "__main__":
    unittest.main()
