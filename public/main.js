
// Heavily based on code from https://github.com/tobika/spotify-auth-PKCE-example

// Your client id from your app in the spotify dashboard:
// https://developer.spotify.com/dashboard/applications
const client_id = `ec89600e478d4d8aa1a78e6a0a7e6097`;

// Use the current origin as the redirect URI to support localhost, 127.0.0.1, etc.
const redirect_uri = window.location.origin; // Your redirect uri
console.log(`Redirect URI: ${redirect_uri}`);
const scope = 'user-read-playback-state user-read-currently-playing'

// Helper functions for cookie-based token storage (persists across OBS restarts)
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function setCookie(name, value, days = 365) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

function getTokensFromCookies() {
    const access = getCookie('spotify_access_token');
    const refresh = getCookie('spotify_refresh_token');
    const expires = getCookie('spotify_expires_at');
    return {
        access_token: access || null,
        refresh_token: refresh || null,
        expires_at: expires ? parseInt(expires, 10) : null
    };
}

function saveTokensToCookies(access, refresh, expires) {
    console.log('Saving tokens to cookies');
    if (access) setCookie('spotify_access_token', access);
    if (refresh) setCookie('spotify_refresh_token', refresh);
    if (expires) setCookie('spotify_expires_at', expires.toString());
    console.log('Tokens saved to cookies');
}

function clearTokenCookies() {
    deleteCookie('spotify_access_token');
    deleteCookie('spotify_refresh_token');
    deleteCookie('spotify_expires_at');
}

// Restore tokens from cookies
const tokens = getTokensFromCookies();
let access_token = tokens.access_token;
let refresh_token = tokens.refresh_token;
let expires_at = tokens.expires_at;

console.log('Initial token state:', {
    hasAccessToken: !!access_token,
    hasRefreshToken: !!refresh_token,
    expiresAt: expires_at
});

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function generateCodeChallenge(codeVerifier) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(codeVerifier),
    );

    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function generateUrlWithSearchParams(url, params) {
    const urlObject = new URL(url);
    urlObject.search = new URLSearchParams(params).toString();

    return urlObject.toString();
}

function redirectToSpotifyAuthorizeEndpoint() {
    const codeVerifier = generateRandomString(64);

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
    console.log('exchangeToken called with code:', code ? 'present' : 'missing');
    const code_verifier = sessionStorage.getItem('code_verifier');
    console.log('code_verifier from sessionStorage:', code_verifier ? 'present' : 'missing');

    fetch('https://accounts.spotify.com/api/token', {
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
        console.log('exchangeToken: Token exchange successful');
        processTokenResponse(data);
        // clear search query params but keep hash
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);

        // Token exchange complete, now safe to start getSong
        console.log('Starting getSong after successful token exchange');
        if (typeof getSong === 'function') {
            getSong();
        }
    })
    .catch((error) => {
        console.error('exchangeToken: Token exchange failed:', error);
        handleError(error);
    });
}

function refreshToken() {
    // Get refresh_token from cookies
    const tokens = getTokensFromCookies();
    const refresh_token_to_use = tokens.refresh_token;

    // Validate the refresh token exists and is not the literal string 'undefined' or 'null'
    if (!refresh_token_to_use || refresh_token_to_use === 'undefined' || refresh_token_to_use === 'null') {
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
            refresh_token: refresh_token_to_use,
        }),
    })
    .then(addThrowErrorToFetch)
    .then(processTokenResponse)
    .catch(handleError);
}

function handleError(error) {
    console.error('handleError called:', error);
    if (window.NODE_ENV !== 'production') {
        console.error(error);
    }

    // If the request failed due to authorization (expired/invalid token), force re-auth
    const status = error && error.response && error.response.status;
    console.log('Error status:', status);
    if (status === 400 || status === 401 || status === 403) {
        // Clear tokens from cookies
        clearTokenCookies();
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
    clearTokenCookies();
    sessionStorage.clear();
    window.location.reload();
}

function processTokenResponse(data) {
    console.log('processTokenResponse called with data:', {
        hasAccessToken: !!data.access_token,
        hasRefreshToken: !!data.refresh_token,
        expiresIn: data.expires_in
    });

    access_token = data.access_token;
    // Only overwrite the stored refresh token if the response includes one.
    // When using the refresh_token grant, Spotify may not return a new refresh_token.
    if (data.refresh_token) {
        refresh_token = data.refresh_token;
    }

    const t = new Date();
    expires_at = t.setSeconds(t.getSeconds() + data.expires_in);

    console.log('About to save tokens - access_token:', access_token ? 'present' : 'missing', 'refresh_token:', refresh_token ? 'present' : 'missing', 'expires_at:', expires_at);

    // Save tokens to cookies for persistence
    saveTokensToCookies(access_token, refresh_token, expires_at);
}
(function () {
    // If the user has accepted the authorize request spotify will come back to your application with the code in the response query string
    // Example: http://127.0.0.1:8889/?code=NApCCg..BkWtQ&state=profile%2Factivity
    const args = new URLSearchParams(window.location.search);
    const code = args.get('code');

    if (code) {
        // we have received the code from spotify and will exchange it for an access_token
        exchangeToken(code);
    } else if (access_token && refresh_token && expires_at) {
        // we are already authorized and have tokens from URL hash
        // check if token is expired or about to expire
        const tokenTimeRemaining = expires_at - Date.now();
        if (tokenTimeRemaining <= 0) {
            console.log('Token expired, refreshing...');
            refreshToken();
        } else {
            console.log(`Token valid for ${Math.round(tokenTimeRemaining / 60000)} more minutes`);
        }
    } else {
        // we are not logged in and have no usable refresh token
        redirectToSpotifyAuthorizeEndpoint();
    }
})();
