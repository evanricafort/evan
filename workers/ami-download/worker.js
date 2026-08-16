/**
 * Asgard Magic Importer download broker — Cloudflare Worker
 *
 * Why this exists
 * ---------------
 * The tool page used to hand the browser a Google Drive address. That works,
 * but the address is then plainly visible in DevTools → Network, and it is a
 * permanent link: once seen it can be shared and reused forever.
 *
 * This worker puts one hop in front of it. The page asks for a download slot,
 * gets back a single-use URL on this worker, and points the browser at that.
 * The worker fetches the file server-side and streams the bytes back, so the
 * browser never learns where the file actually lives — the only address it
 * ever sees is the random one this worker minted.
 *
 *   GET /new   → { "url": "https://…/d/<token>", "expires": 1699999999 }
 *   GET /d/<token> → the file itself
 *
 * Tokens are HMAC-signed and carry their own expiry, so no storage is needed
 * to verify them. Bind a KV namespace called TOKENS to also make them
 * genuinely single-use (see wrangler.toml).
 *
 * Deploy
 * ------
 *   npm i -g wrangler
 *   wrangler login
 *   wrangler secret put TOKEN_SECRET      # any long random string
 *   wrangler deploy
 *
 * Then rebuild the tool page with the worker's URL so it stops using Drive
 * directly — see workers/ami-download/README.md.
 */

/* Only these origins may mint a download. Do not use "*": that would let any
   site drive your worker and burn your Drive bandwidth. */
const ALLOWED_ORIGINS = [
  'https://evanricafort.com',
  'https://www.evanricafort.com'
];

/* The file being served. Nothing else can be requested through this worker. */
const DRIVE_FILE_ID = '1YwhqqvKENlQ48LcLujcNrIPoFCXLzCa7';
const DOWNLOAD_NAME = 'asgard-magic-importer.zip';

/* A minted URL is good for this long. Short, because the page uses it
   immediately — it only has to survive the click that follows. */
const TOKEN_TTL_SECONDS = 120;

/* ------------------------------------------------------------------ utils */

const enc = new TextEncoder();

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - pad.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/* token = <payload>.<signature>, payload = <expiry>:<nonce> */
async function mintToken(secret) {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS}:${nonce}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return { token: `${b64url(enc.encode(payload))}.${b64url(sig)}`, nonce };
}

async function readToken(token, secret) {
  const [p, s] = String(token || '').split('.');
  if (!p || !s) return { ok: false, why: 'malformed' };

  let payload;
  try { payload = new TextDecoder().decode(unb64url(p)); }
  catch { return { ok: false, why: 'malformed' }; }

  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', await hmacKey(secret),
      unb64url(s), enc.encode(payload));
  } catch { return { ok: false, why: 'malformed' }; }
  /* Forged or tampered: the signature is the only thing standing between a
     guessed URL and the file. */
  if (!valid) return { ok: false, why: 'bad signature' };

  const [expStr, nonce] = payload.split(':');
  if (!nonce) return { ok: false, why: 'malformed' };
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return { ok: false, why: 'expired' };

  return { ok: true, nonce };
}

const corsFor = (origin) => ALLOWED_ORIGINS.includes(origin)
  ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
  : null;

const json = (obj, status, headers) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8',
             'cache-control': 'no-store', ...(headers || {}) }
});

/* ------------------------------------------------------- the file itself */

/*
 * Drive serves small public files straight from this endpoint. Larger ones
 * first return an HTML interstitial carrying a confirm token; when that
 * happens the form is submitted server-side so the caller still just gets
 * bytes. Either way the browser never talks to Drive.
 */
async function fetchFromDrive() {
  const base = 'https://drive.usercontent.google.com/download';
  const first = `${base}?id=${DRIVE_FILE_ID}&export=download&confirm=t`;

  let res = await fetch(first, { redirect: 'follow' });
  const type = res.headers.get('content-type') || '';

  if (type.includes('text/html')) {
    const html = await res.text();
    const params = new URLSearchParams();
    for (const m of html.matchAll(/name="([^"]+)"\s+value="([^"]*)"/g)) params.set(m[1], m[2]);
    const action = (html.match(/action="([^"]+)"/) || [])[1];
    if (!action || !params.has('id')) {
      /* Almost always means the file is not shared publicly. */
      return { ok: false, status: 502, why: 'drive returned a page instead of the file' };
    }
    res = await fetch(`${action.replace(/&amp;/g, '&')}?${params}`, { redirect: 'follow' });
  }

  if (!res.ok) return { ok: false, status: 502, why: `drive responded ${res.status}` };
  return { ok: true, res };
}

/* ---------------------------------------------------------------- routes */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsFor(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: cors ? 204 : 403,
        headers: cors
          ? { ...cors, 'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Max-Age': '86400' }
          : {}
      });
    }
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);

    const secret = env.TOKEN_SECRET;
    if (!secret) {
      return json({ error: 'worker is missing TOKEN_SECRET — run: wrangler secret put TOKEN_SECRET' }, 500);
    }

    /* ---- mint a fresh download URL ---- */
    if (url.pathname === '/new') {
      /* Browsers always send Origin on a cross-origin fetch. Refusing the
         unknown ones keeps the worker off other people's pages; it is not a
         security boundary, since anything outside a browser can forge it. */
      if (!cors) return json({ error: 'forbidden origin' }, 403);

      const { token, nonce } = await mintToken(secret);
      if (env.TOKENS) {
        /* Recorded unused; /d marks it spent so the URL works exactly once. */
        ctx.waitUntil(env.TOKENS.put(`n:${nonce}`, '1', { expirationTtl: TOKEN_TTL_SECONDS + 60 }));
      }
      return json({
        url: `${url.origin}/d/${token}`,
        expires: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
        name: DOWNLOAD_NAME
      }, 200, cors);
    }

    /* ---- spend a URL and stream the file ---- */
    if (url.pathname.startsWith('/d/')) {
      const check = await readToken(url.pathname.slice(3), secret);
      if (!check.ok) {
        return json({ error: `link ${check.why}`, hint: 'ask the page for a new one' }, 403);
      }

      if (env.TOKENS) {
        const key = `n:${check.nonce}`;
        const seen = await env.TOKENS.get(key);
        if (seen === null) return json({ error: 'link already used or expired' }, 403);
        await env.TOKENS.delete(key);          /* single use */
      }

      const got = await fetchFromDrive();
      if (!got.ok) return json({ error: got.why }, got.status);

      /* Stream the body through untouched, but replace the headers so nothing
         about the upstream leaks back to the browser. */
      return new Response(got.res.body, {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="${DOWNLOAD_NAME}"`,
          'cache-control': 'no-store, no-cache, must-revalidate',
          'x-content-type-options': 'nosniff',
          ...(got.res.headers.get('content-length')
            ? { 'content-length': got.res.headers.get('content-length') } : {})
        }
      });
    }

    return json({ error: 'not found' }, 404);
  }
};
