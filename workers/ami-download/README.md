# ami-download — download broker for the Asgard Magic Importer

Puts one hop in front of the Google Drive file so the browser never sees where
it actually lives.

Each click on the tool page asks this worker for a download slot. It returns a
random, signed, short-lived URL on the worker itself; the browser fetches that,
and the worker streams the bytes back from Drive server-side. The address in
DevTools is the random one, and it is different every time.

```
GET /new          -> { "url": "https://<worker>/d/<token>", "expires": … }
GET /d/<token>    -> the zip
```

## Deploy

```bash
npm i -g wrangler
wrangler login
cd workers/ami-download
wrangler secret put TOKEN_SECRET      # any long random string
wrangler deploy
```

`TOKEN_SECRET` signs the tokens. Without it the worker returns 500 rather than
handing out unsigned links, so it cannot be forgotten silently.

### Optional: make links single-use

Without this a minted URL keeps working until it expires (120s). With it, the
URL works exactly once.

```bash
wrangler kv namespace create TOKENS
```

Paste the printed id into `wrangler.toml` under the `[[kv_namespaces]]` block
and uncomment it, then `wrangler deploy` again.

## Point the page at it

The tool page keeps the download address inside its encrypted payload, so it
has to be rebuilt once the worker is live:

```bash
node workers/ami-download/build-payload.js \
  <path-to-extension-folder> \
  tools/asgardmagicimporter/index.html \
  <passphrase> \
  https://ami-download.<subdomain>.workers.dev
```

Until that fourth argument is supplied the page falls back to the direct Drive
address, so nothing breaks before the worker exists. Rebuilding is also how you
swap the file or the passphrase later.

## What this does and does not do

It hides **where** the file is. The address the browser sees belongs to the
worker, is random per download, expires in two minutes, and is signed — a
guessed or edited token is rejected.

It is **not** access control. `/new` is reachable by anyone who can load the
tool page; the origin check stops other sites embedding it, but anything
outside a browser can forge an `Origin` header. What actually gates the
download is the passphrase on the page, and that is a shared secret on a public
page. Treat this as concealment, not authorisation.

Drive must stay shared as **Anyone with the link** — the worker fetches it
anonymously. If sharing is revoked the worker returns 502 with a message saying
Drive sent a page instead of the file.
