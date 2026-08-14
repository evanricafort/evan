/* SourceMap Radar - service worker.
 *
 * Collects every JS/CSS asset a tab loads (from the webRequest stream and from a
 * DOM sweep in the content script), then probes each one for a source map:
 *
 *   1. Pull the tail of the asset (Range request) and look for a sourceMappingURL
 *      comment. Falls back to a capped full fetch when the server ignores Range.
 *   2. data: URI comment  -> the map is inlined, the sources are already exposed.
 *   3. Otherwise resolve the comment against the asset URL and GET it. A map only
 *      counts as a finding when it actually comes back as parseable JSON.
 *   4. Optionally guess "<asset>.map" for assets with no comment at all, since
 *      plenty of build pipelines strip the comment but still ship the file.
 */

const TAIL_BYTES = 4096; // sourceMappingURL comments live at the end of the file
const MAX_ASSET_BYTES = 8 * 1024 * 1024; // give up on full-fetch fallback past this
const MAX_MAP_BYTES = 48 * 1024 * 1024;
const CONCURRENCY = 6;
const MAX_ASSETS_PER_TAB = 400;

const DEFAULT_SETTINGS = {
  autoScan: true, // scan automatically as soon as a page finishes loading
  probeGuess: true, // try <asset>.map when no comment is present
  includeCss: true, // scan stylesheets as well as scripts
  authScan: false, // send the browser's cookies when re-fetching assets
  authAllOrigins: false, // ...to every origin, not just the page's own domain
};

const ASSET_PATH_RE = /\.(?:js|mjs|cjs|jsx|ts|tsx|css)(?:$|[?#])/i;
// Matches both the // and /* */ comment forms, and the legacy //@ spelling.
const MAP_COMMENT_RE =
  /[#@]\s*sourceMappingURL\s*=\s*([^\s'"`)]+?)\s*(?:\*\/|[\r\n]|$)/gi;

/** @type {Map<number, TabState>} in-memory mirror of chrome.storage.session */
const tabs = new Map();
/** @type {Map<number, Promise<void>>} in-flight scans, one per tab */
const running = new Map();

function newTabState(url) {
  return {
    pageUrl: url || "",
    assets: {}, // url -> { url, type }
    results: {}, // url -> result record
    scannedAt: 0,
    scanning: false,
    error: "",
  };
}

/* ---------------------------------------------------------------- settings */

async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

/* ------------------------------------------------------------- tab storage */

async function getTab(tabId) {
  if (tabs.has(tabId)) return tabs.get(tabId);
  // The worker may have been torn down since the last scan; rehydrate.
  const key = `tab:${tabId}`;
  const stored = await chrome.storage.session.get(key);
  const state = stored[key] || newTabState("");
  tabs.set(tabId, state);
  return state;
}

async function saveTab(tabId, state) {
  tabs.set(tabId, state);
  await chrome.storage.session.set({ [`tab:${tabId}`]: state });
}

async function resetTab(tabId, url) {
  const state = newTabState(url);
  await saveTab(tabId, state);
  await setBadge(tabId, state);
  return state;
}

/* -------------------------------------------------------------- collection */

function assetTypeOf(url, resourceType) {
  if (resourceType === "script" || resourceType === "stylesheet") {
    return resourceType === "script" ? "js" : "css";
  }
  const m = url.match(ASSET_PATH_RE);
  if (!m) return null;
  return /\.css(?:$|[?#])/i.test(url) ? "css" : "js";
}

async function recordAssets(tabId, entries) {
  if (!entries.length || tabId < 0) return;
  const state = await getTab(tabId);
  let added = 0;
  for (const entry of entries) {
    const url = entry.url;
    if (!url || state.assets[url]) continue;
    if (!/^https?:/i.test(url)) continue;
    if (Object.keys(state.assets).length >= MAX_ASSETS_PER_TAB) break;
    state.assets[url] = { url, type: entry.type };
    added++;
  }
  if (added) await saveTab(tabId, state);
}

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const type = assetTypeOf(details.url, details.type);
    if (!type) return;
    // Fire and forget; ordering against the scan is handled by re-checking
    // state.assets when the scan actually runs.
    recordAssets(details.tabId, [{ url: details.url, type }]);
  },
  { urls: ["http://*/*", "https://*/*"], types: ["script", "stylesheet"] }
);

// A top-level navigation means a fresh page: throw away the previous findings.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    await resetTab(tabId, changeInfo.url);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
  running.delete(tabId);
  chrome.storage.session.remove(`tab:${tabId}`);
});

/* --------------------------------------------------- authenticated scanning */

/* Assets behind a login only come back with the session cookie attached, so the
 * scan can opt into credentialed fetches. That is a loaded gun: a page pulls
 * scripts from CDNs and analytics hosts it does not control, and blindly sending
 * the user's cookies to all of them is worse than a missed finding. So unless
 * authAllOrigins is set, credentials go only to the page's own domain. */

function relatedHosts(a, b) {
  if (a === b) return true;
  return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function credentialsFor(assetUrl, pageUrl, settings) {
  if (!settings.authScan) return "omit";
  if (settings.authAllOrigins) return "include";
  if (!pageUrl) return "omit";
  try {
    return relatedHosts(new URL(assetUrl).hostname, new URL(pageUrl).hostname)
      ? "include"
      : "omit";
  } catch {
    return "omit";
  }
}

/* ------------------------------------------------------------ fetch helpers */

async function fetchTail(url, creds = "omit") {
  // Try a suffix range first so we do not pull megabytes of bundle.
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=-${TAIL_BYTES}` },
      credentials: creds,
      cache: "no-store",
    });
    if (res.status === 206) return { ok: true, text: await res.text() };
    if (res.ok) {
      // Server ignored the Range header and sent the whole body.
      const len = Number(res.headers.get("content-length") || 0);
      if (len > MAX_ASSET_BYTES) return { ok: false, error: "asset too large" };
      const text = await res.text();
      return { ok: true, text: text.slice(-TAIL_BYTES * 4) };
    }
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function findMapComment(text) {
  MAP_COMMENT_RE.lastIndex = 0;
  let last = null;
  let m;
  while ((m = MAP_COMMENT_RE.exec(text)) !== null) last = m[1];
  return last;
}

function summarizeMap(json) {
  const sources = Array.isArray(json.sources) ? json.sources : [];
  const contents = Array.isArray(json.sourcesContent) ? json.sourcesContent : [];
  const withContent = contents.filter(
    (c) => typeof c === "string" && c.length > 0
  ).length;
  return {
    version: json.version ?? null,
    sourceCount: sources.length,
    embeddedSources: withContent,
    sampleSources: sources.slice(0, 12),
  };
}

async function fetchMap(url, creds = "omit") {
  try {
    const res = await fetch(url, { credentials: creds, cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_MAP_BYTES) {
      return { ok: false, status: res.status, error: "map too large to parse" };
    }
    const text = await res.text();
    const size = text.length;
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // A SPA that answers every path with index.html lands here - not a map.
      return { ok: false, status: res.status, error: "response is not JSON" };
    }
    if (!json || (json.version === undefined && !Array.isArray(json.sources))) {
      return { ok: false, status: res.status, error: "JSON is not a source map" };
    }
    return { ok: true, status: res.status, size, summary: summarizeMap(json) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message ? e.message : e) };
  }
}

function decodeInlineMap(comment) {
  // data:application/json;base64,eyJ2ZXJ... or the URL-encoded variant.
  const idx = comment.indexOf(",");
  if (idx < 0) return null;
  const meta = comment.slice(0, idx);
  const payload = comment.slice(idx + 1);
  try {
    const text = /;base64/i.test(meta) ? atob(payload) : decodeURIComponent(payload);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function guessMapUrl(assetUrl) {
  try {
    const u = new URL(assetUrl);
    u.hash = "";
    u.search = "";
    return `${u.toString()}.map`;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- scanning */

async function probeAsset(asset, settings, pageUrl) {
  const assetCreds = credentialsFor(asset.url, pageUrl, settings);
  // Track whether a finding depended on the session: "exposed to anyone" and
  // "exposed to logged-in users" are different findings in a report.
  const base = {
    url: asset.url,
    type: asset.type,
    state: "clean",
    detail: "",
    authed: assetCreds === "include",
  };

  // An inline <script> pointed straight at this URL - there is no separate asset
  // file to tail-read, so go fetch the map directly.
  if (asset.type === "map") {
    const map = await fetchMap(asset.url, assetCreds);
    if (map.ok) {
      return {
        ...base,
        state: "exposed",
        mapUrl: asset.url,
        size: map.size,
        detail: "declared by an inline script and reachable",
        summary: map.summary,
      };
    }
    return {
      ...base,
      state: "declared",
      mapUrl: asset.url,
      detail: `declared by an inline script but not retrievable (${map.error})`,
    };
  }

  const tail = await fetchTail(asset.url, assetCreds);
  if (!tail.ok) {
    if (!settings.probeGuess) {
      return { ...base, state: "error", detail: tail.error };
    }
  }

  const comment = tail.ok ? findMapComment(tail.text) : null;

  if (comment && /^data:/i.test(comment)) {
    const json = decodeInlineMap(comment);
    if (json) {
      return {
        ...base,
        state: "inline",
        mapUrl: "",
        detail: "source map inlined in the asset",
        summary: summarizeMap(json),
      };
    }
    return { ...base, state: "declared", detail: "inline map could not be decoded" };
  }

  if (comment) {
    let mapUrl;
    try {
      mapUrl = new URL(comment, asset.url).toString();
    } catch {
      return { ...base, state: "declared", detail: `unresolvable URL: ${comment}` };
    }
    // The map can sit on a different host than the asset - re-decide there.
    const mapCreds = credentialsFor(mapUrl, pageUrl, settings);
    const map = await fetchMap(mapUrl, mapCreds);
    if (map.ok) {
      return {
        ...base,
        authed: mapCreds === "include",
        state: "exposed",
        mapUrl,
        size: map.size,
        detail: "declared and reachable",
        summary: map.summary,
      };
    }
    return {
      ...base,
      state: "declared",
      mapUrl,
      detail: `declared but not retrievable (${map.error})`,
    };
  }

  if (settings.probeGuess) {
    const guess = guessMapUrl(asset.url);
    if (guess) {
      const map = await fetchMap(guess, assetCreds);
      if (map.ok) {
        return {
          ...base,
          state: "exposed",
          mapUrl: guess,
          size: map.size,
          detail: "no comment in the asset, but the conventional .map path serves one",
          summary: map.summary,
        };
      }
    }
  }

  if (!tail.ok) return { ...base, state: "error", detail: tail.error };
  return base;
}

async function runPool(items, worker) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function scanTab(tabId, { force = false } = {}) {
  if (running.has(tabId)) return running.get(tabId);

  const job = (async () => {
    const settings = await getSettings();
    let state = await getTab(tabId);

    const pending = Object.values(state.assets).filter((a) => {
      if (!settings.includeCss && a.type === "css") return false;
      return force || !state.results[a.url];
    });

    // Prefer the live tab URL: state.pageUrl can lag behind an SPA route change.
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const pageUrl = tab?.url || state.pageUrl || "";
    state.pageUrl = pageUrl || state.pageUrl;

    state.scanning = true;
    state.error = "";
    await saveTab(tabId, state);
    await setBadge(tabId, state);

    try {
      await runPool(pending, async (asset) => {
        const result = await probeAsset(asset, settings, pageUrl);
        // Re-read: other listeners may have added assets while we worked.
        const current = await getTab(tabId);
        current.results[asset.url] = result;
        await saveTab(tabId, current);
        await setBadge(tabId, current);
      });
    } catch (e) {
      const current = await getTab(tabId);
      current.error = String(e && e.message ? e.message : e);
      await saveTab(tabId, current);
    }

    state = await getTab(tabId);
    state.scanning = false;
    state.scannedAt = Date.now();
    await saveTab(tabId, state);
    await setBadge(tabId, state);
  })();

  running.set(tabId, job);
  try {
    await job;
  } finally {
    running.delete(tabId);
  }
}

/* ------------------------------------------------------------------- badge */

function countExposed(state) {
  return Object.values(state.results).filter(
    (r) => r.state === "exposed" || r.state === "inline"
  ).length;
}

async function setBadge(tabId, state) {
  const n = countExposed(state);
  const text = state.scanning && !n ? "…" : n ? String(n) : "";
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: n ? "#dc2626" : "#334155",
    });
  } catch {
    // Tab closed mid-scan.
  }
}

/* ---------------------------------------------------------------- messages */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "assets": {
        const tabId = sender.tab?.id;
        if (tabId == null) return sendResponse({ ok: false });
        const allowed = new Set(["js", "css", "map"]);
        await recordAssets(
          tabId,
          (msg.urls || []).map((u) => ({
            url: u.url,
            type: allowed.has(u.type) ? u.type : "js",
          }))
        );
        const settings = await getSettings();
        if (settings.autoScan) scanTab(tabId);
        return sendResponse({ ok: true });
      }
      case "getState": {
        const state = await getTab(msg.tabId);
        const settings = await getSettings();
        return sendResponse({ ok: true, state, settings });
      }
      case "scan": {
        await scanTab(msg.tabId, { force: !!msg.force });
        const state = await getTab(msg.tabId);
        return sendResponse({ ok: true, state });
      }
      case "clear": {
        const tab = await chrome.tabs.get(msg.tabId).catch(() => null);
        const state = await resetTab(msg.tabId, tab?.url || "");
        return sendResponse({ ok: true, state });
      }
      case "setSettings": {
        const settings = { ...(await getSettings()), ...msg.settings };
        await chrome.storage.local.set({ settings });
        return sendResponse({ ok: true, settings });
      }
      case "download": {
        // The popup cannot fetch cross-origin, so proxy it through here. Use the
        // same credential rule as the scan, or an authed finding would download
        // as a 401 body.
        const settings = await getSettings();
        const state = await getTab(msg.tabId);
        const creds = credentialsFor(msg.url, state.pageUrl, settings);
        try {
          const res = await fetch(msg.url, { credentials: creds });
          if (!res.ok) return sendResponse({ ok: false, error: `HTTP ${res.status}` });
          return sendResponse({ ok: true, text: await res.text() });
        } catch (e) {
          return sendResponse({ ok: false, error: String(e?.message || e) });
        }
      }
      default:
        return sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // keep the channel open for the async reply
});
