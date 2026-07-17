
// Heavily based on code from https://github.com/tobika/spotify-auth-PKCE-example

// Client id is injected at runtime via config.js (generated from the
// SPOTIFY_CLIENT_ID environment variable - see README.md).
const client_id = window.SPOTIFY_CLIENT_ID;
if (!client_id) {
    throw new Error('SPOTIFY_CLIENT_ID is not configured. See README.md for setup instructions.');
}

// Spotify requires an exact redirect URI match (including path and trailing slash).
function getRedirectUri() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';

    // Normalize /index.html to the site root so the URI is stable.
    if (url.pathname.endsWith('/index.html')) {
        url.pathname = url.pathname.slice(0, -'index.html'.length);
    }

    if (!url.pathname) {
        url.pathname = '/';
    }

    return url.toString();
}

const redirect_uri = getRedirectUri(); // Your redirect uri
console.log(`Redirect URI: ${redirect_uri}`);
const scope = 'user-read-playback-state user-read-currently-playing'

// Parse tokens from URL hash (for OBS compatibility)
function getTokensFromHash() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    return {
        access_token: params.get('access_token') || null,
        refresh_token: params.get('refresh_token') || null,
        expires_at: params.get('expires_at') ? Number(params.get('expires_at')) : null
    };
}

function getTokensFromStorage() {
    const storedExpiresAt = localStorage.getItem('expires_at');
    return {
        access_token: localStorage.getItem('access_token') || null,
        refresh_token: localStorage.getItem('refresh_token') || null,
        expires_at: storedExpiresAt ? Number(storedExpiresAt) : null,
    };
}

// Store tokens in URL hash
function saveTokensToHash(access, refresh, expires) {
    const params = new URLSearchParams();
    if (access) params.set('access_token', access);
    if (refresh) params.set('refresh_token', refresh);
    if (expires) params.set('expires_at', expires);
    window.location.hash = params.toString();
}

// Restore tokens from URL hash
const hashTokens = getTokensFromHash();
const storedTokens = getTokensFromStorage();

let access_token = hashTokens.access_token || storedTokens.access_token;
let refresh_token = hashTokens.refresh_token || storedTokens.refresh_token;
let expires_at = hashTokens.expires_at || storedTokens.expires_at;

// Keep OBS compatibility, but restore URL hash from storage on first load when needed.
if (!window.location.hash && (access_token || refresh_token || expires_at)) {
    saveTokensToHash(access_token, refresh_token, expires_at);
}

window.pcsAuthState = window.pcsAuthState || { exchangingToken: false };

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

function base64UrlEncodeBytes(bytes) {
    return btoa(String.fromCharCode(...bytes))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

async function generateCodeChallenge(codeVerifier) {
    if (window.crypto && window.crypto.subtle && window.isSecureContext) {
        const digest = await window.crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(codeVerifier),
        );

        return base64UrlEncodeBytes(new Uint8Array(digest));
    }

    if (!window.sha256 || !window.sha256.arrayBuffer) {
        throw new Error('PKCE fallback unavailable: js-sha256 failed to load.');
    }

    // SubtleCrypto is not available in insecure contexts; use js-sha256 fallback.
    const digest = window.sha256.arrayBuffer(codeVerifier);
    return base64UrlEncodeBytes(new Uint8Array(digest));
}

function generateUrlWithSearchParams(url, params) {
    const urlObject = new URL(url);
    urlObject.search = new URLSearchParams(params).toString();

    return urlObject.toString();
}

function isSpotifyRedirectUriAllowed(urlString) {
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    return isHttps || isLocalhost;
}

function getRedirectUriValidationError(urlString) {
    if (isSpotifyRedirectUriAllowed(urlString)) {
        return null;
    }

    return [
        `redirect_uri: Insecure (${urlString})`,
        'Spotify requires HTTPS for non-localhost redirect URIs.',
        'Use https:// for LAN/remote access, or use localhost on the same machine as the browser.',
    ].join(' ');
}

function redirectToSpotifyAuthorizeEndpoint() {
    const redirectError = getRedirectUriValidationError(redirect_uri);
    if (redirectError) {
        console.error(redirectError);
        const nowPlayingPlaceholder = document.getElementById('now-playing');
        if (nowPlayingPlaceholder) {
            nowPlayingPlaceholder.innerHTML = '<div class="alert alert-danger">Spotify rejected this redirect URI as insecure. Use HTTPS for remote/LAN access, or use localhost on the same machine.</div>';
        }
        return;
    }

    const codeVerifier = generateRandomString(64);
    if (!(window.crypto && window.crypto.subtle && window.isSecureContext) && window.NODE_ENV !== 'production') {
        console.warn('SubtleCrypto unavailable in this browser context; using JS SHA-256 fallback for PKCE S256.');
    }

    generateCodeChallenge(codeVerifier).then((code_challenge) => {
        // Store code_verifier in sessionStorage (works within same browser session)
        window.sessionStorage.setItem('code_verifier', codeVerifier);
        // Redirect to example:
        // GET https://accounts.spotify.com/authorize?response_type=code&client_id=77e602fc63fa4b96acff255ed33428d3&redirect_uri=http%3A%2F%2Flocalhost&scope=user-follow-modify&state=e21392da45dbf4&code_challenge=KADwyz1X~HIdcAG20lnXitK6k51xBP4pEMEZHmCneHD1JhrcHjE1P3yU_NjhBz4TdhV6acGo16PCd10xLwMJJ4uCutQZHw&code_challenge_method=S256

        window.location = generateUrlWithSearchParams(
            'https://accounts.spotify.com/authorize',
            {
                response_type: 'code',
                client_id,
                scope: scope,
                code_challenge_method: 'S256',
                code_challenge,
                redirect_uri,
            },
        );

        // If the user accepts spotify will come back to your application with the code in the response query string
        // Example: http://127.0.0.1:8889/?code=NApCCg..BkWtQ&state=profile%2Factivity
    });
}

function exchangeToken(code) {
    window.pcsAuthState.exchangingToken = true;
    const code_verifier = sessionStorage.getItem('code_verifier');

    return fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({
            client_id,
            grant_type: 'authorization_code',
            code,
            redirect_uri,
            code_verifier,
        }),
    })
    .then(addThrowErrorToFetch)
    .then((data) => {
        processTokenResponse(data);

            // clear search query params but keep hash
            const newUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, newUrl);
        })
        .catch(handleError)
        .finally(() => {
        // Always clear exchange state so polling/auth recovery can proceed.
        window.pcsAuthState.exchangingToken = false;
    });
}

function refreshToken() {
    const refresh_token = localStorage.getItem('refresh_token');
    // Validate the refresh token exists and is not the literal string 'undefined' or 'null'
    if (!refresh_token || refresh_token === 'undefined' || refresh_token === 'null') {
        // nothing we can do; force a full re-auth
        if (window.NODE_ENV !== 'production') {
            console.warn('refreshToken: no valid refresh_token found in storage, redirecting to authorize endpoint');
        }
        redirectToSpotifyAuthorizeEndpoint();
        return;
    }
    fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams({
            client_id,
            grant_type: 'refresh_token',
            refresh_token,
        }),
    })
    .then(addThrowErrorToFetch)
    .then(processTokenResponse)
    .catch(handleError);
}

function handleError(error) {
    if (window.NODE_ENV !== 'production') {
        console.error(error);
    }

    // If the request failed due to authorization (expired/invalid token), force re-auth
    const status = error && error.response && error.response.status;
    if (status === 400 || status === 401 || status === 403) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('expires_at');
        redirectToSpotifyAuthorizeEndpoint();
    }
}

async function addThrowErrorToFetch(response) {
    if (response.ok) {
        return response.json();
    } else {
        throw { response, error: await response.json() };
    }
}

function logout() {
    sessionStorage.clear();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('expires_at');
    window.location.hash = '';
    window.location.reload();
}

function processTokenResponse(data) {
    access_token = data.access_token;
    localStorage.setItem('access_token', access_token);

    // Only overwrite the stored refresh token if the response includes one.
    // When using the refresh_token grant, Spotify may not return a new refresh_token.
    if (data.refresh_token) {
        refresh_token = data.refresh_token;
        localStorage.setItem('refresh_token', refresh_token);
    }

    const t = new Date();
    expires_at = t.setSeconds(t.getSeconds() + data.expires_in);
    localStorage.setItem('expires_at', String(expires_at));

    // Save tokens to URL hash for OBS persistence
    saveTokensToHash(access_token, refresh_token, expires_at);
}


(function () {
    // If the user has accepted the authorize request spotify will come back to your application with the code in the response query string
    // Example: http://127.0.0.1:8889/?code=NApCCg..BkWtQ&state=profile%2Factivity
    const args = new URLSearchParams(window.location.search);
    const code = args.get('code');

    if (code) {
        // we have received the code from spotify and will exchange it for an access_token
        exchangeToken(code);
    } else if (refresh_token || (access_token && expires_at)) {
        // we already have saved tokens; recover access as needed without full re-auth
        // check if token is expired or about to expire
        const tokenTimeRemaining = (expires_at || 0) - Date.now();
        if (tokenTimeRemaining <= 0) {
            console.log('Token expired, refreshing...');
            if (refresh_token) {
                refreshToken();
            } else {
                redirectToSpotifyAuthorizeEndpoint();
            }
        } else {
            console.log(`Token valid for ${Math.round(tokenTimeRemaining / 60000)} more minutes`);
        }
    } else {
        // we are not logged in and have no usable refresh token
        redirectToSpotifyAuthorizeEndpoint();
    }
})();
