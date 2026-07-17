#!/bin/sh
set -eu

: "${SPOTIFY_CLIENT_ID:?SPOTIFY_CLIENT_ID environment variable must be set (see .env.example)}"

envsubst '${SPOTIFY_CLIENT_ID}' \
    < /etc/nginx/config-templates/config.js.template \
    > /usr/share/nginx/html/config.js
