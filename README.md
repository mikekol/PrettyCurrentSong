# PrettyCurrentSong

PrettyCurrentSong is a small, stylable web app that displays information about the current song playing on your Spotify player. It's designed to be added as a Browser Source in OBS. There's no backend — it's a static site that talks to Spotify's API directly from the browser.

## 1. Create a Spotify app

1. Follow the Getting Started guide here: <https://developer.spotify.com/documentation/web-api/quick-start/> (up until "Preparing Your Environments") to create a Spotify app and get a client ID.
2. In your Spotify app dashboard, add a redirect URI that matches exactly how you plan to access the site (scheme, host, port, path, and trailing slash all must match):
    - Local machine: `http://localhost:8889/` and/or `http://127.0.0.1:8889/`
    - LAN hostname: e.g. `http://pi5.local:8889/`
    - Behind a reverse proxy sub-path: e.g. `https://your-host/pcs/`

    Spotify requires HTTPS for any non-`localhost` redirect URI — plain HTTP on a LAN hostname or IP (other than `localhost`/`127.0.0.1`) is rejected. If you need LAN/remote access, put the app behind a reverse proxy that terminates TLS (see [Running behind a reverse proxy](#running-behind-a-reverse-proxy)).

3. Note your client ID — you'll pass it in as the `SPOTIFY_CLIENT_ID` environment variable in the next step. The redirect URI itself is computed dynamically from `window.location` at runtime — nothing to hardcode.

## 2. Run it

### Option A: Docker (recommended)

```bash
cp .env.example .env    # once; set HOST_PORT and SPOTIFY_CLIENT_ID
docker compose up -d --build
```

This builds an `nginx:alpine` image serving `public/` and exposes it on `HOST_PORT` (default `8889`). At container startup, an entrypoint script generates `public/config.js` from the `SPOTIFY_CLIENT_ID` environment variable, so the client ID never needs to be baked into the image. Changes to `public/` require a rebuild:

```bash
docker compose up -d --build
```

To stop it:

```bash
docker compose down
```

### Option B: Node (local dev)

```bash
npm install
SPOTIFY_CLIENT_ID=your_spotify_client_id npm start
```

This serves `public/` at `http://localhost:8889` with caching disabled, so changes are visible on refresh with no rebuild step. A `prestart` script regenerates `public/config.js` from `SPOTIFY_CLIENT_ID` each time you run `npm start`.

## 3. Add it to OBS

1. Launch Spotify and start playing something.
2. Add a Browser Source to your OBS scene, and set the URL to `http://localhost:8889` (or `http://127.0.0.1:8889`).
   I use a height of 90 and a width of 700, but you do you. I recommend checking "Shutdown source when not visible" and "Refresh browser when scene becomes active". Initially, you may want to set the height to be bigger because of the next step.
3. With the server running, click the Interact button in OBS. This opens the app in an interactive window and prompts you to sign into Spotify and authorize the app. You're only granting read access to your current playback state — this app does not and cannot modify your account.
4. Once you're logged in, you should see the currently playing song. Resize the control however you want now.

Auth state is persisted in browser `localStorage` **and** in the page's URL hash, so reopening the page (including OBS reloading the Browser Source, which resets `localStorage` but keeps the URL) should not require a full re-authorization unless the refresh token becomes invalid or is cleared.

The refresh rate is 10 seconds (polled sooner when a song is near its end), so there could be up to a 10-second delay in picking up a song change or pause/play state change.

## Running behind a reverse proxy

Spotify requires HTTPS for anything other than `localhost`/`127.0.0.1`. If you want to reach the app over a LAN hostname or from another machine, put it behind a reverse proxy on infrastructure you already have HTTPS configured for, and forward to the container's `HOST_PORT`.

[`nginx-proxy.conf.example`](nginx-proxy.conf.example) is a drop-in NGINX `location` block for serving the app at a sub-path (e.g. `https://your-host/pcs/`). The trailing slash on `proxy_pass` strips the `/pcs/` prefix, so the container always sees requests at `/` and needs no sub-path awareness. Replace `<HOST>` and `<PORT>` with where the container is running, then register the full URL (e.g. `https://your-host/pcs/`) as a redirect URI in your Spotify app dashboard.

If you don't already have a reverse proxy with HTTPS set up, any TLS-terminating proxy (Caddy, Traefik, nginx with certbot, a cloud load balancer, etc.) in front of the container will work — this repo doesn't prescribe one.

## Something doesn't look quite right

If you're using this in OBS (and you probably are), you'll need to add some custom CSS (as of OBS 30.0.2, OBS uses what is essentially Chrome v103 as the rendering engine for the Browser Source.  Some of the style units I used aren't supported by Chrome until v105, so we'll need to override some of the CSS styles to make it look as intended.  Please feel free to manipulate these values as necessary to make things look as you'd like.):

```css
.song-title {
    font-size: 25pt;
}
.artists {
    font-size: 15pt;
}
.cover-art {
    border-radius: 3%;
    padding: 1%;
    width: 75px;
}
```
