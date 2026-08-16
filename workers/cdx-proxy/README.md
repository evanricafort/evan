# CDX proxy

A one-hop proxy for the Wayback CDX API, so the archive fetcher can copy and
download raw results.

## Why it is needed

`web.archive.org/cdx/search/cdx` sends no `Access-Control-Allow-Origin` header.
A browser will happily *render* that response in an iframe but will not let
page JavaScript *read* it. That distinction is why the tool can show a live
preview with no proxy at all, yet cannot put the same text on the clipboard or
into a file.

Every proxy-free route was tested and is closed:

| Route | Result |
| --- | --- |
| `fetch` from the page | refused, no CORS header |
| JSONP via `<script>` | server ignores `callback`, nothing executes |
| Reading the preview iframe | cross-origin, `SecurityError` |
| `archive.org` CDX mirror | refused |
| Wayback availability API | refused |
| TimeMap endpoint | refused |

CORS is enforced by the browser and is not something a page can work around,
so the only fix is to fetch server-side. This worker is that server.

## Deploy

```bash
npm i -g wrangler
wrangler login
wrangler deploy
```

Wrangler prints the deployed URL, e.g.
`https://cdx-proxy.<your-subdomain>.workers.dev`.

## Point the tool at it

In `tools/webarchive/index.html`, set:

```js
const CDX_PROXY_ENDPOINT = 'https://cdx-proxy.<your-subdomain>.workers.dev/?q=';
```

Note the trailing `/?q=` — the tool appends the URL-encoded CDX query to it.

While that constant is empty the tool ignores this worker completely and uses
the public proxies, so deploying is optional and nothing breaks if you skip it.

## What it will and will not do

It only accepts `GET`, and only for URLs matching
`https://web.archive.org/cdx/search/cdx?…`. That restriction matters: without
it the worker would be an open relay that anyone could point at any host,
including addresses inside a private network.

`access-control-allow-origin` is pinned to the origins in `ALLOWED_ORIGINS`
rather than `*`, so it answers for your site and not for anyone who finds the
URL. Widen that list if you host the tool somewhere else.

Responses are cached for five minutes at the edge, and the body is passed
through untouched so copied and downloaded output is byte-for-byte what the
CDX API returned.
