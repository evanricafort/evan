/* SourceMap Radar - popup. */

const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));

let tabId = null;
let current = { state: null, settings: null };
let poll = null;

const STATE_LABEL = {
  exposed: "exposed",
  inline: "inline",
  declared: "declared",
  clean: "clean",
  error: "error",
};

function shortName(url) {
  try {
    const u = new URL(url);
    const file = u.pathname.split("/").filter(Boolean).pop() || u.pathname;
    return { file, origin: u.origin };
  } catch {
    return { file: url, origin: "" };
  }
}

function fmtSize(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function saveText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function render() {
  const state = current.state;
  const results = Object.values(state?.results || {});
  const assets = Object.values(state?.assets || {});

  const exposed = results.filter((r) => r.state === "exposed" || r.state === "inline");
  const declared = results.filter((r) => r.state === "declared");
  const clean = results.filter((r) => r.state === "clean");

  $("n-exposed").textContent = exposed.length;
  $("n-declared").textContent = declared.length;
  $("n-clean").textContent = clean.length;
  $("n-total").textContent = assets.length;
  $("page-url").textContent = state?.pageUrl || "—";
  $("export").disabled = results.length === 0;

  if (state?.scanning) {
    const done = results.length;
    $("status").textContent = `scanning ${done}/${assets.length}…`;
  } else if (state?.error) {
    $("status").textContent = state.error;
  } else if (state?.scannedAt) {
    $("status").textContent = `scanned ${new Date(state.scannedAt).toLocaleTimeString()}`;
  } else {
    $("status").textContent = "";
  }

  const onlyFindings = $("only-findings").checked;
  const order = { exposed: 0, inline: 1, declared: 2, error: 3, clean: 4 };
  const shown = results
    .filter((r) => !onlyFindings || r.state === "exposed" || r.state === "inline" || r.state === "declared")
    .sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || a.url.localeCompare(b.url));

  const list = $("results");
  list.textContent = "";

  for (const r of shown) {
    const { file, origin } = shortName(r.url);
    const li = document.createElement("li");

    const row = document.createElement("div");
    row.className = "row";
    const tag = document.createElement("span");
    tag.className = `tag ${r.state}`;
    tag.textContent = STATE_LABEL[r.state] || r.state;
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = file;
    name.title = r.url;
    row.append(tag, name);

    // Flag findings that only came back because the session cookie was sent.
    if (r.authed && (r.state === "exposed" || r.state === "inline")) {
      const authTag = document.createElement("span");
      authTag.className = "tag auth";
      authTag.textContent = "auth";
      authTag.title = "Retrieved with your session cookies — may not be public";
      row.append(authTag);
    }
    li.append(row);

    const detail = document.createElement("div");
    detail.className = "detail";
    detail.textContent = r.detail || origin;
    li.append(detail);

    if (r.summary) {
      const meta = document.createElement("div");
      meta.className = "meta";
      const embedded = r.summary.embeddedSources;
      meta.innerHTML =
        `<b>${r.summary.sourceCount}</b> sources · ` +
        `<b>${embedded}</b> with embedded content` +
        (r.size ? ` · ${fmtSize(r.size)}` : "") +
        (embedded > 0 ? " · <b>full source recoverable</b>" : "");
      li.append(meta);

      if (r.summary.sampleSources?.length) {
        const pre = document.createElement("div");
        pre.className = "sources";
        pre.textContent = r.summary.sampleSources.join("\n");
        li.append(pre);
      }
    }

    const actions = document.createElement("div");
    actions.className = "actions";

    if (r.mapUrl) {
      const copy = document.createElement("button");
      copy.textContent = "Copy map URL";
      copy.onclick = () => {
        navigator.clipboard.writeText(r.mapUrl);
        copy.textContent = "Copied";
        setTimeout(() => (copy.textContent = "Copy map URL"), 1200);
      };

      const open = document.createElement("button");
      open.textContent = "Open";
      open.onclick = () => chrome.tabs.create({ url: r.mapUrl });

      const dl = document.createElement("button");
      dl.textContent = "Download .map";
      dl.onclick = async () => {
        dl.disabled = true;
        dl.textContent = "…";
        const res = await send({ type: "download", url: r.mapUrl, tabId });
        if (res?.ok) {
          saveText(`${file}.map`, res.text);
          dl.textContent = "Download .map";
        } else {
          dl.textContent = res?.error || "failed";
        }
        dl.disabled = false;
      };
      actions.append(copy, open, dl);
    }

    const copyAsset = document.createElement("button");
    copyAsset.textContent = "Copy asset URL";
    copyAsset.onclick = () => {
      navigator.clipboard.writeText(r.url);
      copyAsset.textContent = "Copied";
      setTimeout(() => (copyAsset.textContent = "Copy asset URL"), 1200);
    };
    actions.append(copyAsset);

    li.append(actions);
    list.append(li);
  }

  $("empty").hidden = shown.length > 0;
  if (!shown.length) {
    $("empty").textContent = assets.length
      ? onlyFindings
        ? "No source maps found on this page."
        : "Nothing scanned yet — hit Rescan."
      : "No assets recorded yet. Reload the page, then hit Rescan.";
  }
}

function renderAuthNote(settings, pageUrl) {
  const note = $("auth-note");
  $("scope-wrap").hidden = !settings.authScan;

  if (!settings.authScan) {
    note.hidden = false;
    note.className = "note";
    note.textContent = "Off: assets are re-fetched anonymously. Maps behind a login will read as errors.";
    return;
  }

  let host = "";
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = "this page's domain";
  }

  note.hidden = false;
  if (settings.authAllOrigins) {
    note.className = "note warn";
    note.textContent =
      "Your cookies are sent to EVERY origin this page loads assets from, including third-party CDNs and analytics hosts. Only use this on targets you control.";
  } else {
    note.className = "note";
    note.textContent = `Cookies are sent to ${host} and its subdomains only; other origins stay anonymous.`;
  }
}

async function refresh() {
  const res = await send({ type: "getState", tabId });
  if (!res?.ok) return;
  current = res;
  $("opt-auto").checked = res.settings.autoScan;
  $("opt-guess").checked = res.settings.probeGuess;
  $("opt-css").checked = res.settings.includeCss;
  $("opt-auth").checked = res.settings.authScan;
  $("opt-auth-all").checked = res.settings.authAllOrigins;
  renderAuthNote(res.settings, res.state?.pageUrl);
  render();

  // Keep refreshing while a scan is in flight so counts tick up live.
  if (res.state.scanning && !poll) {
    poll = setInterval(refresh, 500);
  } else if (!res.state.scanning && poll) {
    clearInterval(poll);
    poll = null;
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  if (tabId == null) return;

  $("rescan").onclick = async () => {
    $("rescan").disabled = true;
    send({ type: "scan", tabId, force: true });
    setTimeout(refresh, 150);
    setTimeout(() => ($("rescan").disabled = false), 400);
  };

  $("clear").onclick = async () => {
    await send({ type: "clear", tabId });
    refresh();
  };

  $("export").onclick = () => {
    const payload = {
      page: current.state.pageUrl,
      scannedAt: new Date(current.state.scannedAt || Date.now()).toISOString(),
      authenticatedScan: current.settings.authScan
        ? current.settings.authAllOrigins
          ? "all origins"
          : "page domain only"
        : false,
      findings: Object.values(current.state.results).filter((r) => r.state !== "clean"),
      assetsScanned: Object.keys(current.state.results).length,
    };
    saveText("sourcemap-radar.json", JSON.stringify(payload, null, 2));
  };

  $("only-findings").onchange = render;

  for (const [id, key] of [
    ["opt-auto", "autoScan"],
    ["opt-guess", "probeGuess"],
    ["opt-css", "includeCss"],
  ]) {
    $(id).onchange = async (e) => {
      await send({ type: "setSettings", settings: { [key]: e.target.checked } });
    };
  }

  // Changing the credential mode invalidates every existing result, so re-run
  // rather than leave a list mixing authed and anonymous verdicts.
  for (const [id, key] of [
    ["opt-auth", "authScan"],
    ["opt-auth-all", "authAllOrigins"],
  ]) {
    $(id).onchange = async (e) => {
      const res = await send({ type: "setSettings", settings: { [key]: e.target.checked } });
      if (res?.settings) renderAuthNote(res.settings, current.state?.pageUrl);
      send({ type: "scan", tabId, force: true });
      setTimeout(refresh, 150);
    };
  }

  refresh();
}

init();
