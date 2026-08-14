# SourceMap Radar

Chrome/Edge extension (Manifest V3) that automatically scans every page you visit for
exposed JavaScript and CSS source maps, and tells you which ones are *actually*
retrievable — not just declared.

## Install

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. **Load unpacked** → select this folder.

## How it detects maps

For every `.js` / `.css` asset a tab loads:

1. **Collect** — assets come from two places: the `webRequest` stream (live loads) and a
   DOM + Resource-Timing sweep in the content script (catches cache hits, bfcache, and
   late SPA chunks). Inline scripts carrying their own `sourceMappingURL` are picked up too.
2. **Tail-read** — a `Range: bytes=-4096` request pulls just the end of the bundle, where
   the `//# sourceMappingURL=` comment lives. Falls back to a size-capped full fetch when
   the server ignores `Range`. Both `//#` / `/*# */` and the legacy `//@` forms are matched.
3. **Classify**:
   - `data:` URI → **inline**, the map is embedded and the sources are already exposed.
   - Otherwise resolve the comment against the asset URL and `GET` it.
4. **Verify** — a map only counts when the response parses as JSON *and* looks like a
   source map (`version` or a `sources` array). This is what keeps SPAs that return
   `index.html` for every path from producing a wall of false positives.
5. **Guess** (optional) — for assets with no comment, try `<asset>.map`. Build pipelines
   often strip the comment but still deploy the file.

Findings report the source count, how many entries have `sourcesContent` (meaning the
original source is fully recoverable, not just filenames), the map size, and a sample of
source paths.

## Verdicts

| Tag | Meaning |
| --- | --- |
| `exposed` | Map fetched and parsed. Original source is retrievable. |
| `inline` | Map is base64/URL-encoded inside the asset itself. |
| `declared` | Comment present but the map 404s / isn't valid JSON. Info-leak of build paths only. |
| `clean` | No comment, and no map at the conventional path. |
| `error` | Asset couldn't be re-fetched (auth, CORS-less redirect, too large). |

## Authenticated scanning

Assets behind a login only come back with the session cookie attached. **Authenticated
scan** re-fetches with `credentials: "include"`, reusing the session already in your
browser — log into the target normally, then scan.

It is **off by default**, and it is scoped:

| Mode | Cookies sent to |
| --- | --- |
| Off (default) | nothing — every fetch is anonymous |
| On | the page's own hostname, plus its subdomains and parent domain |
| On + **All origins** | every origin the page loads assets from |

The scoping matters. A page pulls scripts from CDNs, tag managers, and analytics hosts it
doesn't control; sending your session cookies to all of them to chase a source map is a
worse outcome than a missed finding. Host matching is done on exact-or-dot-boundary
suffixes, so `app.target.com.evil.com` does **not** match `target.com`. Turn on **All
origins** only for targets whose asset hosts you own.

Findings retrieved with cookies carry an **`auth`** chip and an `"authed": true` field in
the JSON export — "exposed to anyone" and "exposed to logged-in users" are different
findings and shouldn't be written up the same way. Toggling either auth setting forces a
rescan so a result list never mixes credentialed and anonymous verdicts.

Caveat: `SameSite=Strict` cookies may not be attached to extension-initiated requests in
all Chrome versions. If an authenticated scan still returns 401/403 on assets you can load
in a normal tab, that's the likely cause.

## UI

The toolbar badge shows the count of exposed + inline maps for the current tab (red when
non-zero). The popup lists findings with per-item **Copy map URL**, **Open**, and
**Download .map**, plus **Export JSON** for the whole page.

Toggles: **Auto-scan** (scan on page load), **Guess `.map`**, **Include CSS**,
**Findings only**, **Authenticated scan** (+ **All origins**).

## Notes

- Fetches run through the service worker, which has host permissions, so CORS is not a
  limitation.
- Results are per-tab and live in `chrome.storage.session` — they clear on navigation and
  when the browser closes. Settings persist in `chrome.storage.local`.
- Concurrency is capped at 6 requests and 400 assets per tab, so a scan won't hammer a target.
- Pairs with your **JS SourceMap Unmapper** tool: download the `.map` here, unpack it there.

Use on systems you're authorized to test.
