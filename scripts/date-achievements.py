#!/usr/bin/env python3
"""Write the achievements list's last-changed date into index.html.

The date used to be fetched from the GitHub API in the browser, which meant
it depended on a network call, an unauthenticated rate limit shared by every
visitor on an IP, and a sessionStorage cache that never expired. A tab that
looked the date up before an entry was added kept showing the old one.

So CI settles it instead: the newest commit touching js/achievements.js that
was not made by the stamping bot, in Asia/Manila, written straight into the
markup. Nothing to fetch, nothing to cache, right on first paint.
"""

import io
import re
import subprocess
import sys
import time

LIST = 'js/achievements.js'
PAGE = 'index.html'
BOT = 'github-actions[bot]'
MANILA = 8 * 3600  # UTC+8 year round, no daylight saving

SPAN = re.compile(r'(<span id="achievements-updated">)([^<]*)(</span>)')


def last_human_change():
    log = subprocess.run(
        ['git', 'log', '--format=%ct%x09%an', '--', LIST],
        capture_output=True, text=True, check=True).stdout
    for line in log.splitlines():
        when, _, who = line.partition('\t')
        if who != BOT:
            return int(when)
    return None


def main():
    when = last_human_change()
    if when is None:
        print('No commit history for ' + LIST + ' -- leaving the date alone.')
        return 0

    # %-d is not portable (it fails on Windows), so build the day by hand.
    day = time.gmtime(when + MANILA)
    stamp = '%s %d, %d' % (
        time.strftime('%B', day), day.tm_mday, day.tm_year)

    with io.open(PAGE, encoding='utf-8', newline='') as handle:
        page = handle.read()

    if not SPAN.search(page):
        print('No achievements-updated span in ' + PAGE + '.', file=sys.stderr)
        return 1

    fixed = SPAN.sub(lambda m: m.group(1) + stamp + m.group(3), page, count=1)
    if fixed == page:
        print('Already ' + stamp + '.')
        return 0

    with io.open(PAGE, 'w', encoding='utf-8', newline='') as handle:
        handle.write(fixed)
    print('Dated the achievements list ' + stamp + '.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
