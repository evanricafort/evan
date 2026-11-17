#!/usr/bin/env python3
"""Stamp local asset references with a hash of the file they point at.

GitHub Pages serves our stylesheets and scripts with max-age=259200, so a
browser that has them holds them for three days and never asks again. Purging
Cloudflare does not reach those copies -- only a different URL does. Pointing
the markup at `site.js?v=<hash of site.js>` means a changed file is a changed
URL, and the next page load fetches it.

Images too: profile.jpg carries no version of its own, so a new photo sat
behind the old one in every browser that had it until the cache lapsed.

The version is the file's own content hash, so running this twice over an
unchanged tree rewrites nothing. That is what keeps the workflow that runs it
from committing in a loop.
"""

import hashlib
import io
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Local references only: the (?!https?:|//) guard keeps CDN and cross-site
# URLs untouched, and excluding ':' from the path stops mailto: and friends.
STAMPABLE = 'js|css|jpg|jpeg|png|gif|svg|webp|ico|avif'
REFERENCE = re.compile(
    r'(?P<attr>src|href)="(?P<path>(?!https?:|//)/?[^"?:]+\.(?:' + STAMPABLE + r'))'
    r'(?:\?v=[0-9a-f]+)?"'
)

# Hashing normalises line endings for text, where a Windows checkout differs
# from CI; doing that to binary bytes would be meaningless.
TEXT_SUFFIXES = {'.js', '.css', '.html', '.svg'}
SKIP = {'.git', 'node_modules', 'vendor'}


def digest(path):
    body = path.read_bytes()

    # A Windows checkout holds CRLF where the repository and CI hold LF, and
    # hashing the raw bytes would hand the two a different version for the
    # same file -- so CI would re-stamp after every push from Windows. Only
    # text is affected; a JPEG has to be hashed exactly as it is.
    if path.suffix.lower() in TEXT_SUFFIXES:
        body = body.replace(b'\r\n', b'\n')

    return hashlib.sha256(body).hexdigest()[:8]

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


def pages():
    """Only what git tracks.

    Scratch directories sit beside the site in a working copy, and rewriting
    somebody's unrelated files would be a nasty surprise. Falling back to a
    plain walk keeps this usable outside a checkout.
    """
    try:
        listed = subprocess.run(
            ['git', '-C', str(ROOT), 'ls-files', '-z', '--', '*.html'],
            capture_output=True, check=True).stdout.decode('utf-8')
        found = [ROOT / name for name in listed.split(chr(0)) if name]
        if found:
            return sorted(found)
    except (OSError, subprocess.CalledProcessError):
        pass

    return sorted(ROOT.rglob('*.html'))


def main():
    cache = {}
    changed = []

    for page in pages():
        if SKIP & set(page.relative_to(ROOT).parts):
            continue
        if (page.parent / 'manifest.json').exists():
            # A browser extension's own source, not a page of the site. Its
            # files are loaded from disk by the browser, so a version query
            # buys nothing and would rewrite the shipped extension whenever
            # its CSS changed.
            continue
        if stamp(page, cache):
            changed.append(page.relative_to(ROOT).as_posix())

    for name in changed:
        print('  stamped %s' % name)

    print('%d page(s) updated, %d asset(s) hashed' % (len(changed), len(cache)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
