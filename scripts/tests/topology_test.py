import importlib.util
from pathlib import Path
import tempfile
import unittest

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


if __name__ == '__main__':
    unittest.main()
