import importlib.util
from pathlib import Path
import tempfile
import unittest
import contextlib
import json
from unittest import mock

spec = importlib.util.spec_from_file_location("topology", Path(__file__).resolve().parents[1] / "topology.py")
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


class CaddyOwnershipTest(unittest.TestCase):
    sites = [{"slug": "one", "state": "active", "port": 8101, "domains": ["one.example.test", "alias.example.test"]}]
    original = '''{
    email operator@example.test
}
platform.example.test {
    reverse_proxy 127.0.0.1:3100
}
one.example.test, alias.example.test {
    encode gzip
    handle {
        reverse_proxy 127.0.0.1:8101
    }
}
unrelated.example.test {
    respond "unchanged { text }" 200
}
'''

    def test_requires_explicit_adoption(self):
        with self.assertRaises(ValueError):
            ops.render_caddy(self.original, self.sites)

    def test_adopts_only_owned_tenant_domains_and_preserves_other_routes(self):
        rendered = ops.render_caddy(self.original, self.sites, adopt=True)
        self.assertIn('platform.example.test {\n    reverse_proxy 127.0.0.1:3100', rendered)
        self.assertIn('unrelated.example.test {\n    respond "unchanged { text }" 200', rendered)
        self.assertEqual(rendered.count('one.example.test'), 1)
        self.assertEqual(rendered.count('alias.example.test'), 1)
        self.assertEqual(ops.render_caddy(rendered, self.sites), rendered)

    def test_refuses_to_remove_a_block_with_an_unknown_alias(self):
        with self.assertRaises(ValueError):
            ops.render_caddy(self.original.replace('alias.example.test', 'unknown.example.test'), self.sites, adopt=True)

    def test_suspend_applies_to_all_registered_aliases(self):
        suspended = [{**self.sites[0], 'state': 'suspended'}]
        rendered = ops.render_caddy(self.original, suspended, adopt=True)
        self.assertEqual(rendered.count('503'), 2)
        self.assertEqual(rendered.count('reverse_proxy 127.0.0.1:3100'), 1)

    def test_invalid_markers_refused(self):
        with self.assertRaises(ValueError):
            ops.render_caddy(ops.BEGIN + '\n', self.sites)


class EnvTest(unittest.TestCase):
    def test_updates_without_dropping_keys_or_making_repeated_backups(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, '.env')
            path.write_text('# keep\nDATABASE_URL=secret\nSITE_KEY=old\n')
            ops.write_env(path, {'SITE_KEY': 'new', 'PLATFORM_URL': 'http://platform:3000'})
            self.assertEqual(ops.read_env(path)['DATABASE_URL'], 'secret')
            self.assertEqual(ops.read_env(path)['SITE_KEY'], 'new')
            self.assertTrue(path.with_name('.env.before-topology').exists())
            before = path.read_text()
            ops.write_env(path, {'SITE_KEY': 'new', 'PLATFORM_URL': 'http://platform:3000'})
            self.assertEqual(path.read_text(), before)

    def test_sql_values_cannot_break_out_of_a_string(self):
        self.assertEqual(ops.sql_value("a'; DROP TABLE x;--"), "'a''; DROP TABLE x;--'")


class BackupTest(unittest.TestCase):
    def fixture(self, root):
        items = []
        for slug in ['platform', 'example']:
            directory = root / slug
            directory.mkdir()
            (directory / '.env').write_text('QA_ONLY=test\n')
            (directory / 'docker-compose.yml').write_text('services: {}\n')
            item = {'composeDir': str(directory), 'composeFiles': ['docker-compose.yml'], 'envFile': str(directory / '.env')}
            if slug != 'platform':
                (directory / 'content').mkdir()
                (directory / 'content/menu.json').write_text('{}')
                item.update(slug=slug, contentDir=str(directory / 'content'))
            items.append(item)
        caddy = root / 'Caddyfile'
        caddy.write_text('example.test {\n respond "QA" 200\n}\n')
        return {'version': 1, 'baseDir': str(root / 'operations'), 'sourceDir': str(root / 'source'), 'caddyFile': str(caddy), 'platform': items[0], 'sites': [items[1]]}

    def test_snapshot_contains_the_configuration_needed_for_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            config = self.fixture(Path(directory))
            def archive(args, data=None):
                Path(args[2]).write_bytes(b'archive')
            with mock.patch.object(ops, 'lock', lambda *args: contextlib.nullcontext()), mock.patch.object(ops, 'dump_database', lambda item, path: Path(path).write_bytes(b'dump')), mock.patch.object(ops, 'run', archive):
                snapshot = ops.backup(config)
            self.assertEqual(json.loads((snapshot / 'topology.json').read_text()), config)
            self.assertEqual((snapshot / 'deployment/example/docker-compose.yml').read_text(), 'services: {}\n')
            self.assertEqual((snapshot / 'Caddyfile').read_text(), Path(config['caddyFile']).read_text())
            self.assertTrue((snapshot / 'example.dump').is_file())
            self.assertTrue((snapshot / 'example-content.tar.gz').is_file())

    def test_failure_does_not_publish_a_partial_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            config = self.fixture(Path(directory))
            with mock.patch.object(ops, 'lock', lambda *args: contextlib.nullcontext()), mock.patch.object(ops, 'dump_database', side_effect=RuntimeError('QA dump failed')):
                with self.assertRaises(RuntimeError):
                    ops.backup(config)
            root = Path(config['baseDir'], 'backups')
            self.assertEqual(list(root.glob('release-*')), [])
            self.assertEqual(list(root.glob('.partial-*')), [])


if __name__ == '__main__':
    unittest.main()
