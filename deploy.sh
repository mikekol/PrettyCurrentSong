#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
git pull
# SPOTIFY_CLIENT_ID is the only server-side secret (PKCE flow — no client_secret needed).
# Tokens live in the browser's localStorage; no Vault fetch required here.
VAULT_ADDR=http://antec.sapsucker-ratio.ts.net:8200
export VAULT_ADDR
vault kv get -format=json secret/pi5/pcs \
  | jq -r '.data.data | to_entries[] | "\(.key)=\(.value)"' > .env
docker compose -p pcs up -d --build
