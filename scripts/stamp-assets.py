#!/usr/bin/env python3
"""Stamp local css/js references with a hash of the file they point at.

GitHub Pages serves our stylesheets and scripts with max-age=259200, so a
browser that has them holds them for three days and never asks again. Purging
Cloudflare does not reach those copies -- only a different URL does. Pointing
the markup at `site.js?v=<hash of site.js>` means a changed file is a changed
URL, and the next page load fetches it.

The version is the file's own content hash, so running this twice over an
unchanged tree rewrites nothing. That is what keeps the workflow that runs it
from committing in a loop.
"""

import hashlib
import io
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REFERENCE = re.compile(r'(?P<attr>src|href)="(?P<path>/?(?:js|css)/[^"?]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"')
SKIP = {'.git', 'node_modules', 'vendor'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def stamp(page, cache):
    original = io.open(page, encoding='utf-8', newline='').read()
    missing = []

    def replace(match):
        ref = match.group('path')
        # A leading slash is from the site root; anything else sits beside the page.
        target = ROOT / ref.lstrip('/') if ref.startswith('/') else page.parent / ref
        target = target.resolve()

        if not target.is_file():
            missing.append(ref)
            return match.group(0)

        if target not in cache:
            cache[target] = digest(target)

        return '%s="%s?v=%s"' % (match.group('attr'), ref, cache[target])

    updated = REFERENCE.sub(replace, original)

    for ref in missing:
        print('  ! %s -> %s (no such file)' % (page.relative_to(ROOT), ref))

    if updated == original:
        return False

    io.open(page, 'w', encoding='utf-8', newline='').write(updated)
    return True


def main():
    cache = {}
    changed = []

    for page in sorted(ROOT.rglob('*.html')):
        if SKIP & set(page.relative_to(ROOT).parts):
            continue
        if stamp(page, cache):
            changed.append(page.relative_to(ROOT).as_posix())

    for name in changed:
        print('  stamped %s' % name)

    print('%d page(s) updated, %d asset(s) hashed' % (len(changed), len(cache)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
