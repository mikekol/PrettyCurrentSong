
// Heavily based on code from https://github.com/tobika/spotify-auth-PKCE-example


// Your client id from your app in the spotify dashboard:
// https://developer.spotify.com/dashboard/applications
const client_id = `ec89600e478d4d8aa1a78e6a0a7e6097`;

const redirect_uri = 'http://localhost:8888'; // Your redirect uri
const scope = 'user-read-playback-state user-read-currently-playing'

// Restore tokens from localStorage
let access_token = localStorage.getItem('access_token') || null;
let refresh_token = localStorage.getItem('refresh_token') || null;
let expires_at = localStorage.getItem('expires_at') || null;

function generateRandomString(length) {
    let text = '';
    const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
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
        window.localStorage.setItem('code_verifier', codeVerifier);
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
        // Example: http://localhost:8888/?code=NApCCg..BkWtQ&state=profile%2Factivity
    });
}

function exchangeToken(code) {
    const code_verifier = localStorage.getItem('code_verifier');

    fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
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

            // clear search query params in the url
            window.history.replaceState({}, document.title, '/');
        })
        .catch(handleError);
}

function refreshToken() {
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
    console.error(error);
    // mainPlaceholder.innerHTML = errorTemplate({
    //     status: error.response.status,
    //     message: error.error.error_description,
    // });
}

async function addThrowErrorToFetch(response) {
    if (response.ok) {
        return response.json();
    } else {
        throw { response, error: await response.json() };
    }
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

function processTokenResponse(data) {
    access_token = data.access_token;
    refresh_token = data.refresh_token;

    const t = new Date();
    expires_at = t.setSeconds(t.getSeconds() + data.expires_in);

    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('expires_at', expires_at);
}


(function () {
    // If the user has accepted the authorize request spotify will come back to your application with the code in the response query string
    // Example: http://localhost:8888/?code=NApCCg..BkWtQ&state=profile%2Factivity
    const args = new URLSearchParams(window.location.search);
    const code = args.get('code');

    if (code) {
        // we have received the code from spotify and will exchange it for a access_token
        exchangeToken(code);
    } else if (access_token && refresh_token && expires_at) {
        // we are already authorized and reload our tokens from localStorage
        // so we're pretty good here.
    } else {
        // we are not logged in
        redirectToSpotifyAuthorizeEndpoint()
    }
})();
