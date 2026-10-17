#!/usr/bin/env bash
# The dev container, started, and able to see the folder given (this repo, if
# none is). The container is made with this repo mounted; a folder outside the
# repo is mounted beside it (its whole git repo, when it is in one), which means making the container again when that
# folder is not in it yet. Prints the container's name. Run on the host.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
folder=${1:-$root}

name() {
  podman ps -a --filter "label=devcontainer.local_folder=$root" --format '{{.Names}}' | head -1
}

sees() {
  local at mounts
  mounts=$(podman inspect "$1" --format '{{range .Mounts}}{{.Destination}}{{"\n"}}{{end}}') || return 1
  while read -r at; do
    [ -n "$at" ] || continue
    case "$folder/" in "$at"/*) return 0 ;; esac
  done <<<"$mounts"
  return 1
}

# A folder in a git repo brings the whole repo: a deployment's packages can sit
# beside it (the repo's own packages/), not only inside it.
top=$(git -C "$folder" rev-parse --show-toplevel 2>/dev/null || echo "$folder")

c=$(name)
if [ -z "$c" ] || ! sees "$c"; then
  mount=()
  case "$top/" in
    "$root"/*) ;;
    *) mount=(--mount "type=bind,source=$top,target=$top") ;;
  esac
  [ -z "$c" ] || echo "The dev container cannot see $folder. Making it again with that folder mounted, which takes a few minutes." >&2
  # Its postCreateCommand installs each app's packages.
  npx -y @devcontainers/cli@0.89.0 up --workspace-folder . --docker-path podman \
    --remove-existing-container "${mount[@]}" >&2
  c=$(name)
else
  podman start "$c" >/dev/null
fi
echo "$c"
