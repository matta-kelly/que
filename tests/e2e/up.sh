#!/usr/bin/env bash
# Checks what `just up` starts: que's server on port 2024, with its MCP mouth,
# and the settings UI on port 3000; that a second `just up` starts no second
# server; and that `just stop` then `just start` brings the same container back
# serving. Run on the host, with the deployment given. Its .env sets
# DEV_USER_EMAIL, so the MCP request has a user. It leaves que up, so the
# browser tests can run after it.
#
#   tests/e2e/up.sh <deployment folder>
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
dep=$(cd "${1:?usage: up.sh <deployment folder>}" && pwd)
failed=0

ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; failed=$((failed + 1)); }
stop() { echo "FAIL  $1" >&2; exit 1; }

up() { just --justfile "$root/justfile" up "$dep" 2>&1; }

first=$(up) || stop "just up failed: $first"
c=$(cd "$root" && just _container)
[ -n "$c" ] || stop "just up left no dev container"

# Port 2024 is que's server: POST /mcp answers an initialize as the MCP server "que".
body=$(mktemp)
trap 'rm -f "$body"' EXIT
init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"up.sh","version":"0"}}}'
code=$(curl -sS --max-time 10 -o "$body" -w '%{http_code}' -X POST localhost:2024/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d "$init" || true)
name=$(jq -r '.result.serverInfo.name // empty' "$body" 2>/dev/null || true)
if [ "$code" = 200 ] && [ "$name" = que ]; then
  ok "port 2024 is que's server: POST /mcp answered initialize as que"
else
  bad "port 2024 is not que's MCP server: POST /mcp gave $code $(head -c 200 "$body")"
fi

if curl -sS -o /dev/null --max-time 30 localhost:3000; then
  ok "the settings UI answers on port 3000"
else
  bad "the settings UI does not answer on port 3000"
fi

# A second `just up` finds que's server running, says so, and starts no second one.
second=$(up) || true
if grep -q "already running" <<<"$second"; then
  ok "a second just up says the server is already running"
else
  bad "a second just up did not say the server is already running: $(tail -3 <<<"$second")"
fi

# `just stop` keeps the container and stops it; `just start` brings the same one back, serving.
just --justfile "$root/justfile" stop >/dev/null 2>&1 || bad "just stop failed"
if [ "$(podman inspect --format '{{.State.Running}}' "$c" 2>/dev/null)" = false ]; then
  ok "just stop stops the container and keeps it"
else
  bad "just stop did not leave the container there and stopped"
fi
started=$(just --justfile "$root/justfile" start "$dep" 2>&1) || bad "just start failed: $(tail -3 <<<"$started")"
if [ "$(cd "$root" && just _container)" = "$c" ] && curl -sf --max-time 10 -o /dev/null localhost:2024/ok && curl -sS -o /dev/null --max-time 30 localhost:3000; then
  ok "just start brings the same container back, and the server and the UI answer"
else
  bad "just start did not bring the same container back serving: $(tail -3 <<<"$started")"
fi

echo
if [ "$failed" = 0 ]; then echo "all passed"; else echo "$failed failed"; fi
[ "$failed" = 0 ]
