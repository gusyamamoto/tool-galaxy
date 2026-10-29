"""Prepare a disabled, isolated Travel Alpha artifact. Never deploy or activate cloud."""
import argparse
import importlib.util
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('alpha_staging_helpers', ROOT / 'scripts/prepare-staging.py')
staging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(staging)
DISABLED_CONFIG = """// Generated foundation build: cloud activation requires a separately reviewed release.
const cosmifoldAlphaConfig = Object.freeze({applicationMode:'cloud-alpha',milestone:1,
    cloudEnabled:false,allowedOrigin:'',localBetaOrigin:'',authStorageKey:'cosmifold:travel-alpha:auth:v1'});
"""
DISABLED_AUTH = 'const cosmifoldAuthConfig = Object.freeze({});\n'
FORBIDDEN = {'index.html', 'script.js', 'startup.js', 'config.js', 'auth-config.js', 'account-startup.js',
             'persistence/local-metadata-store.js', 'persistence/local-preferences-store.js',
             'persistence/indexeddb-file-store.js', 'services/local-restore.js', 'services/local-backup.js'}


def runtime_assets(root=ROOT):
    root = Path(root).resolve()
    pending = ['alpha.html', '404.html']
    assets = set()
    while pending:
        relative = pending.pop()
        parsed = urlsplit(relative)
        if parsed.scheme == 'data':
            continue
        if parsed.scheme or parsed.netloc:
            raise ValueError('Alpha assets must be local')
        target = (root / unquote(parsed.path)).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise ValueError('Missing or out-of-root Alpha asset')
        name = target.relative_to(root).as_posix()
        if name in FORBIDDEN or any(part.startswith('.') for part in Path(name).parts) or name.split('/')[0] in {'dev', 'tests', 'docs', 'scripts', 'supabase'} or name.startswith('staging'):
            raise ValueError('Non-Alpha asset referenced: ' + name)
        if name in assets:
            continue
        assets.add(name)
        if target.suffix == '.html':
            parser = staging.AssetReferences()
            parser.feed(target.read_text(encoding='utf-8'))
            pending.extend((Path(name).parent / value).as_posix() for value in parser.references)
        elif target.suffix == '.css':
            for match in re.finditer(r'url\(\s*[\'\"]?([^\'\")]+)[\'\"]?\s*\)', target.read_text(encoding='utf-8')):
                value = match.group(1).strip()
                pending.append(value if value.startswith('data:') else (Path(name).parent / value).as_posix())
    if 'assets/fonts/Manrope-Variable.ttf' in assets:
        if not (root / 'assets/fonts/OFL-Manrope.txt').is_file():
            raise ValueError('Manrope license missing')
        assets.add('assets/fonts/OFL-Manrope.txt')
    required = {'alpha/config.js', 'alpha/auth-config.js', 'alpha/startup.js', 'alpha/foundation.js',
                'services/cloud-workspace.js', 'services/supabase-metadata-gateway.js'}
    if not required <= assets:
        raise ValueError('Alpha bootstrap is incomplete')
    return sorted(assets)


def prepare(output, root=ROOT):
    root, output = Path(root).resolve(), Path(output).resolve()
    if output.exists() or output == root or root.is_relative_to(output) or any(part.startswith('staging') for part in output.parts) or output.is_relative_to(root) and output.parent != root:
        raise ValueError('Use a new Alpha directory, never an existing deployment folder')
    assets = runtime_assets(root)
    payload = {('index.html' if name == 'alpha.html' else name): (root / name).read_bytes() for name in assets}
    payload['alpha/config.js'] = DISABLED_CONFIG.encode()
    payload['alpha/auth-config.js'] = DISABLED_AUTH.encode()
    payload['_headers'] = staging.offline_headers((root / '_headers').read_text(encoding='utf-8')).encode()
    for name, content in payload.items():
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    return sorted(payload)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'alpha-build')
    args = parser.parse_args()
    try:
        files = prepare(args.output)
    except (OSError, ValueError) as error:
        parser.exit(2, f'STOPPED: {error}\n')
    print(f'Prepared {len(files)} isolated Alpha files in {args.output.resolve()}')
    print('Cloud disabled; public Auth blank. Nothing deployed. Existing beta untouched.')
