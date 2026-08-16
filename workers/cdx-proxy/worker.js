/**
 * CDX proxy — Cloudflare Worker
 *
 * Why this exists
 * ---------------
 * web.archive.org's CDX API sends no Access-Control-Allow-Origin header, so a
 * browser will not let page JavaScript read its response. That is why the
 * archive fetcher can render results in an iframe (the browser may *display*
 * a cross-origin document) but cannot copy or download them (it may not
 * *read* one).
 *
 * This worker is the one hop that closes that gap: it fetches the CDX URL
 * server-side, where CORS does not apply, and returns the identical bytes with
 * a CORS header attached. It replaces a dependency on third-party proxies with
 * one you control.
 *
 * Deploy
 * ------
 *   npm i -g wrangler
 *   wrangler login
 *   wrangler deploy
 *
 * Then set CDX_PROXY_ENDPOINT in tools/webarchive/index.html to the worker's
 * URL with the query parameter, for example:
 *
 *   const CDX_PROXY_ENDPOINT = 'https://cdx-proxy.<subdomain>.workers.dev/?q=';
 *
 * Until that constant is set the tool ignores this worker entirely and keeps
 * using the public proxies, so deploying is optional.
 */

/* Only this origin may read the response. Widen if you host the tool
   elsewhere; do not set it to "*" — that would let any site use your worker
   as an open relay. */
const ALLOWED_ORIGINS = [
  'https://evanricafort.com',
  'https://www.evanricafort.com'
];

/* Only Wayback CDX URLs may be fetched. Without this the worker would be a
   general-purpose open proxy that anyone could point at any host, including
   private addresses. */
const ALLOWED_TARGET = /^https:\/\/web\.archive\.org\/cdx\/search\/cdx\?/;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'GET, OPTIONS',
    'vary': 'Origin'
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    const target = new URL(request.url).searchParams.get('q');
    if (!target) {
      return new Response('Missing q parameter', { status: 400, headers: cors });
    }
    if (!ALLOWED_TARGET.test(target)) {
      return new Response('Only web.archive.org CDX queries are allowed', {
        status: 403,
        headers: cors
      });
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        method: 'GET',
        headers: { 'User-Agent': 'evanricafort-cdx-proxy' },
        /* CDX answers for a large domain can take a while; let it. */
        cf: { cacheTtl: 300, cacheEverything: true }
      });
    } catch (err) {
      return new Response('Upstream fetch failed: ' + err.message, {
        status: 502,
        headers: cors
      });
    }

    /* Pass the body through untouched so what the tool copies and downloads is
       byte-for-byte what the CDX API returned. */
    return new Response(upstream.body, {
      status: upstream.status,
      headers: Object.assign({}, cors, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=300'
      })
    });
  }
};
