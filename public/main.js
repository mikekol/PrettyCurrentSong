
// Client id is injected at runtime via config.js (generated from the
// SPOTIFY_CLIENT_ID environment variable - see README.md).
const client_id = window.SPOTIFY_CLIENT_ID;
if (!client_id) {
    throw new Error('SPOTIFY_CLIENT_ID is not configured. See README.md for setup instructions.');
}

class SpotifyAuth {
    static #SCOPE = 'user-read-playback-state user-read-currently-playing';
    // Refresh when less than 5 minutes remain — long enough to avoid expiry
    // between a getSong() check and the actual Spotify API call.
    static #TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;

    #clientId;
    #redirectUri;
    #accessToken = null;
    #refreshToken = null;
    #expiresAt = null;
    // Set to a Promise while a token exchange or startup refresh is in progress.
    // getValidAccessToken() awaits this before doing anything, preventing races
    // between the initial auth flow and the first getSong() poll.
    #pending = null;

    constructor(clientId) {
        this.#clientId = clientId;
        this.#redirectUri = SpotifyAuth.#computeRedirectUri();
        console.log(`Redirect URI: ${this.#redirectUri}`);
        this.#loadTokens();
    }

    // Returns a valid access token, refreshing if needed.
    // Redirects to Spotify auth if no usable tokens exist.
    // Awaits any in-progress exchange or startup refresh before acting.
    async getValidAccessToken() {
        if (this.#pending) await this.#pending;

        if (this.#expiresAt && Date.now() < this.#expiresAt - SpotifyAuth.#TOKEN_EXPIRY_MARGIN_MS) {
            return this.#accessToken;
        }

        if (this.#refreshToken) {
            await this.#doRefresh();
            return this.#accessToken;
        }

        this.#redirectToAuthorize();
        return null;
    }

    logout() {
        sessionStorage.clear();
        this.#clearTokens();
        window.location.reload();
    }

    // Called once after construction. Handles the Spotify redirect callback
    // (code exchange) and proactively refreshes an expired token on startup.
    initialize() {
        const code = new URLSearchParams(window.location.search).get('code');
        if (code) {
            // The Promise is stored before any await so getValidAccessToken()
            // sees #pending immediately when the inline script calls it.
            this.#pending = this.#exchange(code)
                .catch((err) => {
                    console.error('Token exchange failed:', err);
                    this.#clearTokens();
                    this.#redirectToAuthorize();
                })
                .finally(() => { this.#pending = null; });
            return;
        }

        if (this.#refreshToken || (this.#accessToken && this.#expiresAt)) {
            const remaining = (this.#expiresAt || 0) - Date.now();
            if (remaining <= 0 && this.#refreshToken) {
                console.log('Token expired on startup, refreshing...');
                this.#pending = this.#doRefresh()
                    .catch((err) => console.error('Startup refresh failed:', err))
                    .finally(() => { this.#pending = null; });
            } else if (remaining > 0) {
                console.log(`Token valid for ${Math.round(remaining / 60000)} more minutes`);
            } else {
                this.#redirectToAuthorize();
            }
        } else {
            this.#redirectToAuthorize();
        }
    }

    // --- Private: token storage ---

    #loadTokens() {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const fromHash = {
            accessToken: hashParams.get('access_token'),
            refreshToken: hashParams.get('refresh_token'),
            expiresAt: hashParams.get('expires_at') ? Number(hashParams.get('expires_at')) : null,
        };
        const fromStorage = {
            accessToken: localStorage.getItem('access_token'),
            refreshToken: localStorage.getItem('refresh_token'),
            expiresAt: localStorage.getItem('expires_at') ? Number(localStorage.getItem('expires_at')) : null,
        };

        this.#accessToken = fromHash.accessToken || fromStorage.accessToken;
        this.#refreshToken = fromHash.refreshToken || fromStorage.refreshToken;
        this.#expiresAt = fromHash.expiresAt || fromStorage.expiresAt;

        // Restore the URL hash from storage on first load for OBS persistence.
        // OBS resets localStorage on reload but preserves the URL.
        if (!window.location.hash && (this.#accessToken || this.#refreshToken || this.#expiresAt)) {
            this.#saveToHash();
        }
    }

    #saveTokens(accessToken, refreshToken, expiresAt) {
        this.#accessToken = accessToken;
        this.#expiresAt = expiresAt;
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('expires_at', String(expiresAt));

        // Only overwrite the refresh token if the response includes one.
        // Spotify may not return a new refresh_token on the refresh grant.
        if (refreshToken) {
            this.#refreshToken = refreshToken;
            localStorage.setItem('refresh_token', refreshToken);
        }

        this.#saveToHash();
    }

    #saveToHash() {
        const params = new URLSearchParams();
        if (this.#accessToken) params.set('access_token', this.#accessToken);
        if (this.#refreshToken) params.set('refresh_token', this.#refreshToken);
        if (this.#expiresAt) params.set('expires_at', this.#expiresAt);
        window.location.hash = params.toString();
    }

    #clearTokens() {
        this.#accessToken = null;
        this.#refreshToken = null;
        this.#expiresAt = null;
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('expires_at');
        window.location.hash = '';
    }

    // --- Private: Spotify auth operations ---

    async #exchange(code) {
        const codeVerifier = sessionStorage.getItem('code_verifier');
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.#clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.#redirectUri,
                code_verifier: codeVerifier,
            }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw Object.assign(new Error(`Token exchange failed: ${response.status}`), { response, body });
        }
        const data = await response.json();
        this.#saveTokens(data.access_token, data.refresh_token, Date.now() + data.expires_in * 1000);

        // Strip the code from the URL but preserve the hash (OBS tokens).
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }

    async #doRefresh() {
        const refreshToken = this.#refreshToken;
        if (!refreshToken || refreshToken === 'undefined' || refreshToken === 'null') {
            this.#redirectToAuthorize();
            return;
        }
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.#clientId,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            if (response.status >= 400 && response.status < 500) {
                this.#clearTokens();
                this.#redirectToAuthorize();
            }
            throw Object.assign(new Error(`Token refresh failed: ${response.status}`), { response, body });
        }
        const data = await response.json();
        this.#saveTokens(data.access_token, data.refresh_token, Date.now() + data.expires_in * 1000);
    }

    #redirectToAuthorize() {
        const url = new URL(this.#redirectUri);
        const isAllowed = url.protocol === 'https:' ||
            url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.hostname === '[::1]';

        if (!isAllowed) {
            console.error(`redirect_uri: Insecure (${this.#redirectUri}). Spotify requires HTTPS for non-localhost redirect URIs.`);
            const el = document.getElementById('now-playing');
            if (el) {
                el.innerHTML = '<div class="alert alert-danger">Spotify rejected this redirect URI as insecure. Use HTTPS for remote/LAN access, or use localhost on the same machine.</div>';
            }
            return;
        }

        const codeVerifier = SpotifyAuth.#generateRandomString(64);
        SpotifyAuth.#generateCodeChallenge(codeVerifier).then((challenge) => {
            sessionStorage.setItem('code_verifier', codeVerifier);
            const authUrl = new URL('https://accounts.spotify.com/authorize');
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('client_id', this.#clientId);
            authUrl.searchParams.set('scope', SpotifyAuth.#SCOPE);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('code_challenge', challenge);
            authUrl.searchParams.set('redirect_uri', this.#redirectUri);
            window.location = authUrl.toString();
        });
    }

    // --- Private: PKCE helpers ---

    static #generateRandomString(length) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return values.reduce((acc, x) => acc + possible[x % possible.length], '');
    }

    static #base64UrlEncodeBytes(bytes) {
        return btoa(String.fromCharCode(...bytes))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    }

    static async #generateCodeChallenge(verifier) {
        if (window.crypto && window.crypto.subtle && window.isSecureContext) {
            const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
            return SpotifyAuth.#base64UrlEncodeBytes(new Uint8Array(digest));
        }
        // SubtleCrypto is unavailable in insecure contexts (e.g. plain HTTP in OBS).
        // Fall back to the js-sha256 library loaded in index.html.
        if (!window.sha256 || !window.sha256.arrayBuffer) {
            throw new Error('PKCE fallback unavailable: js-sha256 failed to load.');
        }
        return SpotifyAuth.#base64UrlEncodeBytes(new Uint8Array(window.sha256.arrayBuffer(verifier)));
    }

    // --- Private: URL helpers ---

    static #computeRedirectUri() {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        if (url.pathname.endsWith('/index.html')) {
            url.pathname = url.pathname.slice(0, -'index.html'.length);
        }
        if (!url.pathname) {
            url.pathname = '/';
        }
        return url.toString();
    }
}

window.spotifyAuth = new SpotifyAuth(client_id);
window.spotifyAuth.initialize();
