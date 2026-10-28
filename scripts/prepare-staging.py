"""Prepare an offline static staging site; never deploy or touch browser data."""
import argparse
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
STAGING_AUTH = "// Public staging is local-only: no Auth SDK/session or remote account requests.\nconst cosmifoldAuthConfig = Object.freeze({});\n"


class AssetReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        for key in ('src', 'poster'):
            if attributes.get(key):
                self.references.append(attributes[key])
        if tag == 'img' and attributes.get('data-src'):
            self.references.append(attributes['data-src'])
        if tag in ('img', 'source'):
            for key in ('srcset', 'data-srcset'):
                if attributes.get(key):
                    self.references.extend(candidate.strip().split()[0] for candidate in attributes[key].split(',') if candidate.strip())
        if tag == 'link' and attributes.get('href'):
            self.references.append(attributes['href'])


def runtime_assets(root):
    """Copy declared assets only, retaining their existing relative locations."""
    root = Path(root).resolve()
    pending = ['index.html', '404.html', '_headers', 'vendor/LICENSES.txt', 'vendor/README.md']
    assets = set()
    while pending:
        reference = pending.pop()
        url = urlsplit(reference)
        if url.scheme == 'data':
            continue
        if url.scheme or url.netloc:
            raise ValueError('Staging asset must be local')
        target = (root / unquote(url.path).lstrip('/')).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise ValueError(f'Missing or out-of-root staging asset: {url.path}')
        relative = target.relative_to(root).as_posix()
        # A newly added reference must not silently publish diagnostics/config.
        if relative.split('/')[0] in {'dev', 'tests', 'docs', 'scripts', 'supabase'} or any(part.startswith('.') for part in Path(relative).parts):
            raise ValueError('Non-runtime directory referenced by staging page')
        if relative in assets:
            continue
        assets.add(relative)
        if target.suffix == '.html':
            parser = AssetReferences()
            parser.feed(target.read_text(encoding='utf-8'))
            pending.extend(parser.references)
        elif target.suffix == '.css':
            for match in re.finditer(r'url\(\s*(?:"([^"]*)"|\'([^\']*)\'|([^)]*))\s*\)', target.read_text(encoding='utf-8')):
                value = next(part for part in match.groups() if part is not None).strip()
                if not value.startswith(('data:', '#')):
                    pending.append(value if value.startswith('/') else (Path(relative).parent / value).as_posix())
    if 'assets/fonts/Manrope-Variable.ttf' in assets:
        license_file = root / 'assets/fonts/OFL-Manrope.txt'
        if not license_file.is_file():
            raise ValueError('Bundled Manrope license is missing')
        assets.add('assets/fonts/OFL-Manrope.txt')
    return sorted(assets)


def offline_headers(source):
    """Retain existing security/cache rules; staging needs no external API/SDK."""
    lines = []
    for line in source.splitlines():
        if line.startswith('#'):
            line = '# Static staging responses. User data stays browser-local.'
        if 'Content-Security-Policy:' in line:
            directives = []
            for directive in line.strip().split(':', 1)[1].split(';'):
                words = directive.split()
                if words and words[0] in {'script-src', 'connect-src'}:
                    words = [word for word in words if not word.startswith(('https:', 'http:'))]
                if words:
                    directives.append(' '.join(words))
            line = '  Content-Security-Policy: ' + '; '.join(directives)
        lines.append(line)
    return '\n'.join(lines) + '\n'


def prepare(output, root=ROOT):
    root, output = Path(root).resolve(), Path(output).resolve()
    assets = runtime_assets(root)
    if output == root or root.is_relative_to(output) or output.exists():
        raise ValueError('Use a new, dedicated output directory; existing paths are never removed or overwritten')
    # Read/validate before creating the output; never copy an entire working tree.
    payload = {name: (root / name).read_bytes() for name in assets}
    if 'auth-config.js' not in payload or 'script.js' not in payload:
        raise ValueError('Expected Auth configuration and preloaded app script are missing')
    payload['auth-config.js'] = STAGING_AUTH.encode('utf-8')
    payload['_headers'] = offline_headers(payload['_headers'].decode('utf-8')).encode('utf-8')
    for name, content in payload.items():
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    return assets


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'staging-site')
    args = parser.parse_args()
    try:
        files = prepare(args.output)
    except (ValueError, OSError) as error:
        parser.exit(2, f'STOPPED: {error}\n')
    print(f'Prepared {len(files)} static files in {args.output.resolve()}')
    print('Auth unconfigured; cloud inactive. Nothing deployed. Publish only this directory.')
