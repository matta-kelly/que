#!/usr/bin/env bash
# The dev container, started, and able to see the folder given (this repo, if
# none is). The container is made with this repo mounted; a folder outside the
# repo is mounted beside it (its whole git repo, when it is in one), which means making the container again when that
# folder is not in it yet. Prints the container's name. Run on the host.
#
# It makes the container with podman alone, from .devcontainer/devcontainer.json's settings, so no Node runs on the host.
# A change to devcontainer.json is made here too.
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

# A short hash of the repo's path, in place of the devcontainerId VS Code uses: one container and one set of volumes per checkout.
# The two hashes are not the same, so the first container made here installs again, into new volumes.
# The volumes of a container made before (by VS Code, or by the devcontainer CLI) stay until they are removed by hand.
id=$(printf '%s' "$root" | sha256sum | cut -c1-12)
# The image, named by its Dockerfile, so a changed Dockerfile builds a new one.
image=localhost/que-dev:$(sha256sum .devcontainer/Dockerfile | cut -c1-12)

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
  # Built before any container goes, so a build that fails leaves the old one.
  podman image exists "$image" || podman build -t "$image" .devcontainer >&2
  [ -z "$c" ] || echo "The dev container cannot see $folder. Making it again with that folder mounted, which takes a few minutes." >&2
  # Every container for this checkout goes, VS Code's too, so `just` cannot find one that cannot see the folder.
  old=$(podman ps -aq --filter "label=devcontainer.local_folder=$root")
  [ -z "$old" ] || xargs podman rm -f <<<"$old" >/dev/null
  c=que-dev-$id
  podman rm -f --ignore "$c" >/dev/null
  # A container whose install did not finish (it failed, or the script was stopped) is removed, so the next run makes it again.
  trap 'podman rm -f "$c" >/dev/null 2>&1' EXIT
  # The settings of devcontainer.json: the repo at its host path, the four volumes, your user as `node`, the host network.
  # --init stops the container at once on `podman stop`, which `sleep` as the first process would not.
  podman run -d --init --name "$c" -l "devcontainer.local_folder=$root" \
    --userns=keep-id:uid=1000,gid=1000 --network=host --security-opt label=disable \
    --mount "type=bind,source=$root,target=$root" \
    --mount "type=volume,source=que-node-modules-$id,target=$root/server/node_modules" \
    --mount "type=volume,source=que-ui-node-modules-$id,target=$root/ui/node_modules" \
    --mount "type=volume,source=que-cache-$id,target=/home/node/.cache" \
    --mount "type=volume,source=que-ui-next-$id,target=$root/ui/.next" \
    "${mount[@]}" -w "$root" "$image" sleep infinity >/dev/null
  # devcontainer.json's postCreateCommand: new volumes start root-owned, so hand them to `node`, then install.
  {
    podman exec -u root "$c" chown node:node server/node_modules ui/node_modules ui/.next /home/node/.cache
    podman exec -u node -w "$root/server" "$c" npm ci
    podman exec -u node -w "$root/ui" "$c" sh -c 'npm ci && npx playwright install chromium'
  } >&2
  trap - EXIT
else
  podman start "$c" >/dev/null
fi
echo "$c"
