"""Local-only tests for the public staging artifact; no deployment or credentials."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare_staging', ROOT / 'scripts/prepare-staging.py')
staging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(staging)


class StagingPackageTests(unittest.TestCase):
    def test_runtime_only_and_source_unchanged(self):
        auth = (ROOT / 'auth-config.js').read_bytes()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'site'
            files = staging.prepare(output)
            self.assertEqual(sorted(p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file()), files)
            self.assertTrue({'index.html', 'startup.js', 'script.js', 'body-renderer.js', 'first-use.js', 'task-views.js', 'sidebar-split.js', 'task-lists.js', 'ids.js', 'vendor/LICENSES.txt',
                             'persistence/local-metadata-store.js', 'persistence/indexeddb-file-store.js', 'services/local-restore-session.js',
                             'services/local-restore.js', 'object-urls.js', 'storage-capacity.js', 'services/attachment-storage-audit.js', 'backup-ui.js'} <= set(files))
            for probe in ['tests/restore_model_fixture.py', 'tests/object_url_probe.js', 'tests/storage_capacity_browser.py',
                          'tests/attachment_orphan_probe.js', 'tests/persistence_integration_browser.py']:
                self.assertNotIn(probe, files)
            self.assertFalse(any(p.startswith(('dev/', 'tests/', 'docs/', 'scripts/', 'supabase/', '.git/', 'delayed-')) for p in files))
            self.assertFalse(any('cloud-' in p for p in files))
            self.assertEqual((output / 'auth-config.js').read_text(), staging.STAGING_AUTH)
            for name in files:
                if name not in {'auth-config.js', '_headers'}:
                    self.assertEqual((output / name).read_bytes(), (ROOT / name).read_bytes(), name)
            headers = (output / '_headers').read_text()
            self.assertNotIn('https:', headers)
            self.assertIn("script-src 'self';", headers)
            self.assertIn("connect-src 'self' blob:;", headers)
            self.assertIn('Cache-Control: no-cache', headers)
        self.assertEqual((ROOT / 'auth-config.js').read_bytes(), auth)

    def test_existing_output_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            sentinel = output / 'retained.txt'
            sentinel.write_text('retain')
            with self.assertRaises(ValueError):
                staging.prepare(output)
            self.assertEqual(sentinel.read_text(), 'retain')

    def test_source_and_ancestors_are_rejected(self):
        for output in [ROOT, ROOT.parent]:
            with self.assertRaises(ValueError):
                staging.prepare(output)

    def test_missing_escaping_remote_and_dev_assets_refuse_preparation(self):
        for reference in ['missing.js', '../outside.js', 'https://example.com/app.js', 'dev/private.js']:
            with self.subTest(reference=reference), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'vendor').mkdir()
                for name in ['404.html', '_headers', 'vendor/LICENSES.txt', 'vendor/README.md']:
                    (root / name).write_text('')
                (root / 'dev').mkdir()
                (root / 'dev/private.js').write_text('not public')
                (root / 'index.html').write_text(f'<script src="{reference}"></script>')
                with self.assertRaises(ValueError):
                    staging.prepare(root / 'site', root)
                self.assertFalse((root / 'site').exists())


if __name__ == '__main__':
    unittest.main()
