#!/usr/bin/env bash
# The smoke check of que's dev image (.devcontainer/Containerfile), run on the image before any push
# (scripts/dev-image.sh ensure). The image owes it this: both apps install from its npm cache with no
# network, Chromium is in PLAYWRIGHT_BROWSERS_PATH, and it holds no checkout file. It installs into a
# copy in the container's /tmp, never into the checkout.
# Usage: scripts/dev-image-smoke.sh <image>. Exit 0 and `dev image smoke: ok` last when the image is
# good; non-zero, naming the step, when not. The engine is ${ENGINE:-podman}.
set -uo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
engine=${ENGINE:-podman}
image=${1:-}
[ -n "$image" ] || {
  echo "usage: scripts/dev-image-smoke.sh <image>" >&2
  exit 2
}

failed_at() {
  echo "dev image smoke failed at: $1" >&2
  exit 1
}

# offline <app> <files...>: copies the app's files into the container's /tmp and installs offline.
offline() {
  local app=$1
  shift
  "$engine" run --rm --network none -v "$root:/src:ro" "$image" bash -c \
    "mkdir -p /tmp/smoke && tar -C /src --exclude=node_modules -cf - $* | tar -C /tmp/smoke -xf - && cd /tmp/smoke/$app && npm ci --offline --no-audit --no-fund"
}

offline server server || failed_at "the offline install of server/package-lock.json"
offline ui ui/package.json ui/package-lock.json || failed_at "the offline install of ui/package-lock.json"
# shellcheck disable=SC2016 # The path is the image's, so it expands in the container.
"$engine" run --rm "$image" sh -c 'ls -d "$PLAYWRIGHT_BROWSERS_PATH"/chromium-*' >/dev/null ||
  failed_at "Chromium in PLAYWRIGHT_BROWSERS_PATH"
"$engine" run --rm "$image" sh -c 'test ! -e /tmp/bake' || failed_at "no checkout file in the image"
echo "dev image smoke: ok"
