#!/usr/bin/env bash
# The folders of the other checkouts of que that are serving: their dev container runs
# the agent server or the UI. One per line. Every que's container is on the host
# network, and they share que-postgres, so `up` and `down` ask this before they touch
# either. Run on the host.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
podman ps --filter label=devcontainer.local_folder --format '{{.Names}} {{index .Labels "devcontainer.local_folder"}}' |
  while read -r name folder; do
    if [ "$folder" != "$root" ] && [ -f "$folder/server/harness/package.json" ] &&
      podman exec "$name" pgrep -f "langgraphjs dev|next dev" >/dev/null; then
      echo "$folder"
    fi
  done
