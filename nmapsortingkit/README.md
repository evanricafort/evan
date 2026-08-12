# Nmap Result Sorting Kit

Sort and search Nmap scan results by matched / unmatched services.

Live: https://evanricafort.com/nmapsortingkit/

## Contents

- `index.html` — the app. Fully self-contained (no build, no dependencies, works offline).
  This is what gets served at `/nmapsortingkit/`.
- `webapp/` — optional React + TypeScript + Vite source of the same app, for local development.

## Features

- Parses raw `nmap` console output: hosts, ports, state, service banners, and multi-line NSE script blocks.
- Search syntax:
  - `smb` — case-insensitive substring across service, version, state, port, and script output
  - `"quoted phrase"` — treated as a single term
  - `port:445` — exact port match
  - `version:` — matches services that carry version information
  - Multiple terms are ANDed together.
- Matched / Unmatched result lists, click any `ip:port` for full details.
- **Extract Versions** — fills in the `"version:"` search and re-runs version detection.
- Light / dark mode toggle, persisted to `localStorage`, defaults to system preference.

## Local development (optional)

```bash
cd webapp
npm install
npm run dev
```

Building is only needed for the React variant; `index.html` runs as-is.
