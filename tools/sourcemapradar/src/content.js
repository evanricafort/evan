/* SourceMap Radar - content script.
 *
 * The webRequest listener only sees assets loaded after the worker woke up, and
 * it never sees assets served from the memory cache on a back/forward nav. This
 * sweeps the DOM and the resource timeline to fill both gaps, and reports inline
 * scripts that carry their own sourceMappingURL comment.
 */

(function () {
  const MAP_COMMENT_RE = /[#@]\s*sourceMappingURL\s*=\s*([^\s'"`)]+)/i;

  function collect() {
    const found = new Map();

    const add = (raw, type) => {
      if (!raw) return;
      let url;
      try {
        url = new URL(raw, document.baseURI).toString();
      } catch {
        return;
      }
      if (!/^https?:/i.test(url)) return;
      if (!found.has(url)) found.set(url, { url, type });
    };

    for (const el of document.querySelectorAll("script[src]")) add(el.src, "js");
    for (const el of document.querySelectorAll('link[rel~="stylesheet"][href]')) {
      add(el.href, "css");
    }

    // Resource timing catches dynamic imports and chunks the DOM query misses.
    try {
      for (const entry of performance.getEntriesByType("resource")) {
        if (entry.initiatorType === "script") add(entry.name, "js");
        else if (entry.initiatorType === "link" || entry.initiatorType === "css") {
          if (/\.css(?:$|[?#])/i.test(entry.name)) add(entry.name, "css");
        }
      }
    } catch {
      // performance API unavailable in this context
    }

    // Inline scripts can point at a map of their own. There is no separate asset
    // file to read, so hand the map URL to the worker as a direct candidate.
    for (const el of document.querySelectorAll("script:not([src])")) {
      const m = el.textContent && el.textContent.match(MAP_COMMENT_RE);
      if (m && !/^data:/i.test(m[1])) add(m[1], "map");
    }

    return [...found.values()];
  }

  function report() {
    const urls = collect();
    if (!urls.length) return;
    try {
      chrome.runtime.sendMessage({ type: "assets", urls }, () => void chrome.runtime.lastError);
    } catch {
      // Extension context invalidated (reloaded while the page was open).
    }
  }

  report();
  // SPAs pull in chunks well after load; take a couple of later samples.
  setTimeout(report, 1500);
  setTimeout(report, 5000);
})();
