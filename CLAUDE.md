# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

PrettyCurrentSong is a static single-page web app that displays the currently playing Spotify track. It's designed as an OBS Browser Source overlay. There is no backend — everything runs client-side. The server (`http-server`) just serves static files from `public/`.

## Commands

**Local dev (Node)**
```bash
npm install        # install http-server dependency
npm start          # serve public/ at http://localhost:8889 (no cache)
```

**Docker**
```bash
cp .env.example .env          # once; set HOST_PORT if needed
docker compose up -d --build  # build image and start container
docker compose down           # stop and remove container
```

The Docker image (`nginx:alpine`) serves the static files in `public/`. The exposed port is controlled by `HOST_PORT` in `.env` (default `8889`). No build step — changes to `public/` require a rebuild (`--build`).

There are no tests, no build step, and no transpilation. Changes to files in `public/` are live immediately on next browser refresh (local dev) or after `docker compose up -d --build` (Docker).

## Architecture

All application logic lives in two files:

- **`public/main.js`** — Spotify OAuth PKCE flow: generates code challenge, redirects to Spotify, exchanges the auth code for tokens, refreshes tokens, and persists tokens to both `localStorage` and the URL hash (the hash is used for OBS, which reloads the page and would lose `localStorage` state).
- **`public/index.html`** — Everything else: the Handlebars template for the now-playing UI, and an inline `<script>` that polls `GET /v1/me/player/currently-playing` every 10 seconds (or sooner when a song is near its end), renders the template, and handles auth edge cases.

The split between `main.js` and the inline script in `index.html` is intentional: `main.js` handles auth and exposes `access_token`, `refresh_token`, `expires_at`, `refreshToken()`, and `redirectToSpotifyAuthorizeEndpoint()` as globals; the inline script consumes them.

### Token persistence strategy

Tokens are stored in two places simultaneously:
- `localStorage` — survives page reloads in a normal browser.
- URL `#hash` — survives OBS Browser Source reloads (OBS resets `localStorage` on reload but preserves the URL).

On startup, `main.js` reads from both sources and writes back to the hash if the hash is empty but storage has tokens, keeping them in sync.

### Auth flow

1. On load, `main.js` checks for a `?code=` query param (Spotify redirect after user consent).
2. If found, `exchangeToken()` trades the code for tokens via `POST /api/token`.
3. If tokens already exist and are valid, polling starts immediately.
4. If the token is expired (or within 30 minutes of expiry during a poll), `refreshToken()` is called.
5. If no tokens and no code, the user is redirected to Spotify's authorize endpoint.

### OBS-specific concerns

- Font sizes use `cqi` (container query inline) units. OBS's embedded Chromium (v103) does not support `cqi`; the README has CSS overrides for the OBS custom CSS field.
- `window.isSecureContext` may be false when the page is loaded over plain HTTP from another machine. `generateCodeChallenge()` falls back to the `js-sha256` library (loaded from jsDelivr) when `SubtleCrypto` is unavailable.
- Spotify rejects non-localhost HTTP redirect URIs. LAN access requires HTTPS (see README for the Caddy reverse-proxy setup).

## Docker / infrastructure proxy

`nginx-proxy.conf.example` contains the NGINX `location` block to drop into the infrastructure server's config. The key detail is the **trailing slash on `proxy_pass`** — it strips the `/pcs/` prefix so the container always sees requests at `/` and needs no sub-path awareness.

When accessed via the infrastructure proxy at `https://<host>/pcs/`, `getRedirectUri()` in `main.js` resolves to `https://<host>/pcs/` dynamically. That URI must be registered in the Spotify app dashboard.

## Configuration

The only thing that requires editing for a new user is `client_id` at the top of `public/main.js`. The redirect URI is computed dynamically from `window.location` at runtime — no hardcoded URL.

## Image publishing

`.github/workflows/publish-image.yml` builds the Docker image and pushes it to GHCR (`ghcr.io/mikekol/prettycurrentsong`) on every push to `main`, tagged `latest` and with the commit SHA. Deployment machines (e.g. pi5) pull the image directly instead of building from source — see the consuming infra repo's compose file. The GHCR package needs to be public, or the deployment machine needs `docker login ghcr.io` with a PAT that has `read:packages`.
