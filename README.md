# PrettyCurrentSong

PrettyCurrentSong is a small, stylable web app that will display information about the current song playing on your Spotify player.

To configure the application to work with your personal Spotify account:

1. Change line 7 (or thereabouts) in main.js to your own Spotify client ID. To get your own ID, follow the Getting Started guide here: <https://developer.spotify.com/documentation/web-api/quick-start/> (up until Preparing Your Environments).

2. In your Spotify app dashboard, set the redirect URI to match how you plan to access the site:
    - If using `localhost`: `http://localhost:8889/`
    - If using `127.0.0.1`: `http://127.0.0.1:8889/`
    - If using a LAN hostname (for example `http://pi5.local:8889/`), add that exact URI too
   - You can add multiple redirect URIs to support both

    Spotify requires an exact match (scheme, host, port, path, and trailing slash).
    Spotify also requires non-localhost redirect URIs to use HTTPS. Plain HTTP on LAN/IP addresses (for example `http://10.0.0.95:8889/`) is rejected as insecure.

    Note: if the page is loaded from another machine over plain HTTP, some browsers disable `crypto.subtle` (secure-context only). This app includes a JavaScript SHA-256 fallback (from the `js-sha256` npm package, loaded via jsDelivr) so PKCE `S256` still works in that scenario. For stronger security, serve the page over HTTPS so native WebCrypto can be used.

3. Use the `run_pcs.cmd` or `run_pcs.sh` scripts (Windows and Mac/Linux, respectively) to launch the server.

4. Launch Spotify and start playing something.

5. Add a Browser Source to your OBS scene, and set the URL to `http://localhost:8889` (or `http://127.0.0.1:8889` if you prefer).
I use a height of 90 and a width of 700, but you do you.  I recommend checking "Shutdown source when not visible" and "Refresh browser when scene becomes active". Initially, you may want to set the height to be bigger because of the next step.

6. Once you add it (and have the server running!), click the Interact button in OBS. This should open the app in an interactive window, and it should prompt you to sign into Spotify, and authorize the application to access your account. You are only giving the application the permission to read about your current player, and what media it's playing - it is read-only: this app does not and cannot modify any of your account information.

7. Once you're logged in, you should see the currently playing song.  Resize the control however you want now.

Auth state is persisted in browser `localStorage` so opening the page again in the same browser profile should not require a full re-authorization unless the refresh token becomes invalid or is cleared.

The refresh rate is set to 10 seconds, so there could be up to a 10-second delay in picking up a song change or pause/play state change.

## Setup From Scratch (Raspberry Pi + Ubuntu)

If you are rebuilding this on a new machine, use this checklist.

### A) Local-only quick start (no HTTPS)

1. Install Node.js and npm.
2. From the project root, install dependencies:

```bash
npm install
```

3. Start the app server:

```bash
npm start
```

4. Open in a browser on the same machine:

```text
http://localhost:8889/
```

5. In Spotify app settings, include:
    - `http://localhost:8889/`
    - `http://127.0.0.1:8889/`

### B) LAN access with HTTPS via Caddy (recommended)

Spotify rejects non-localhost HTTP redirect URIs. For LAN hostnames/IPs, use HTTPS.

1. Install and run the app server (upstream HTTP):

```bash
npm install
npx http-server public -p 8889 -a 127.0.0.1 -c-1
```

2. Install Caddy:

```bash
sudo apt update
sudo apt install -y caddy
```

3. Configure Caddy at `/etc/caddy/Caddyfile`:

```caddy
pi5.local {
     reverse_proxy 127.0.0.1:8889
     tls internal
}
```

4. Reload Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

5. In Spotify app settings, include:
    - `https://pi5.local/`

6. Import Caddy local root cert on client devices:
    - Cert path on Pi: `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`
    - On Windows, import into `Trusted Root Certification Authorities`

### C) Copy cert from Pi to Windows quickly

From Windows PowerShell:

```powershell
scp pi@pi5.local:/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt $env:USERPROFILE\Downloads\root.crt
```

Then import `root.crt` into the Windows trusted root store.

### D) One-minute troubleshooting

1. Verify app upstream is running:

```bash
curl -I http://127.0.0.1:8889/
```

2. Verify HTTPS endpoint on Pi:

```bash
curl -k -I https://pi5.local/
```

3. Verify listeners:

```bash
ss -ltnp | grep -E '(:443|:8889)'
```

4. Watch Caddy logs live:

```bash
sudo journalctl -u caddy -f
```

5. If auth loops:
    - Clear site storage for the app origin.
    - Confirm Spotify redirect URI is an exact match (including trailing slash).
    - Re-open the exact configured URL (for example `https://pi5.local/`).

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
