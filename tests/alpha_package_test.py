import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare_alpha', ROOT / 'scripts/prepare-alpha.py')
alpha = importlib.util.module_from_spec(spec)
spec.loader.exec_module(alpha)


class AlphaPackageTests(unittest.TestCase):
    def test_separate_disabled_artifact_contains_no_beta_startup_or_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'alpha'
            files = alpha.prepare(output)
            self.assertIn('index.html', files)
            self.assertIn('services/cloud-workspace.js', files)
            self.assertIn('services/supabase-metadata-gateway.js', files)
            self.assertIn('alpha/editor.js', files)
            self.assertIn('body-renderer.js', files)
            self.assertIn('vendor/LICENSES.txt', files)
            self.assertTrue(alpha.FORBIDDEN.isdisjoint(set(files) - {'index.html'}))
            self.assertEqual((output / 'index.html').read_bytes(), (ROOT / 'alpha.html').read_bytes())
            self.assertEqual((output / 'alpha/config.js').read_text(), alpha.DISABLED_CONFIG)
            self.assertEqual((output / 'alpha/auth-config.js').read_text(), alpha.DISABLED_AUTH)
            self.assertNotIn('https:', (output / '_headers').read_text())
            self.assertIn('assets/fonts/OFL-Manrope.txt', files)
            for name in set(files) - {'index.html', 'alpha/config.js', 'alpha/auth-config.js', '_headers'}:
                self.assertEqual((output / name).read_bytes(), (ROOT / name).read_bytes())

    def test_existing_and_deployment_destinations_are_never_written(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            sentinel = path / 'keep.txt'
            sentinel.write_text('keep')
            with self.assertRaises(ValueError):
                alpha.prepare(path)
            with self.assertRaises(ValueError):
                alpha.prepare(path / 'staging-beta-existing')
            with self.assertRaises(ValueError):
                alpha.prepare(ROOT)
            self.assertEqual(sentinel.read_text(), 'keep')
            self.assertFalse((path / 'staging-beta-existing').exists())

    def test_active_source_configuration_cannot_activate_a_foundation_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'source'
            root.mkdir()
            scripts = ['alpha/config.js', 'alpha/auth-config.js', 'alpha/startup.js',
                       'alpha/foundation.js', 'alpha/editor.js', 'services/cloud-workspace.js',
                       'services/supabase-metadata-gateway.js']
            for name in scripts:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('// fixture', encoding='utf-8')
            (root / 'alpha.html').write_text(''.join(f'<script src="{name}"></script>' for name in scripts), encoding='utf-8')
            (root / '404.html').write_text('<p>Missing</p>', encoding='utf-8')
            (root / '_headers').write_bytes((ROOT / '_headers').read_bytes())
            (root / 'alpha/config.js').write_text("const cosmifoldAlphaConfig={cloudEnabled:true,allowedOrigin:'https://fixture.invalid'};", encoding='utf-8')
            (root / 'alpha/auth-config.js').write_text("const cosmifoldAuthConfig={SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST_ONLY'};", encoding='utf-8')
            output = Path(directory) / 'artifact'
            alpha.prepare(output, root)
            self.assertEqual((output / 'alpha/config.js').read_text(), alpha.DISABLED_CONFIG)
            self.assertEqual((output / 'alpha/auth-config.js').read_text(), alpha.DISABLED_AUTH)
            self.assertNotIn('https:', (output / '_headers').read_text())
            self.assertIn('cloudEnabled:true', (root / 'alpha/config.js').read_text())

    def test_beta_entry_and_unsafe_asset_references_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '404.html').write_text('<p>Missing</p>')
            for name in ['script.js', 'startup.js', 'config.js']:
                (root / name).write_text('must not publish')
            for source in ['script.js', 'startup.js', 'config.js', '../outside.js', 'https://example.com/remote.js']:
                with self.subTest(source=source):
                    (root / 'alpha.html').write_text(f'<script src="{source}"></script>')
                    with self.assertRaises(ValueError):
                        alpha.runtime_assets(root)


if __name__ == '__main__':
    unittest.main()
