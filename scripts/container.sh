#!/usr/bin/env bash
# The dev container, started, and able to see the folder given (this repo, if
# none is). The container is made from .devcontainer/devcontainer.json through
# the dev container CLI, with this repo mounted; a folder outside the repo is
# mounted beside it (its whole git repo, when it is in one), which means making
# the container again when that folder is not in it yet. That repo's packages
# are installed in the container, from its lockfile, so each of its files
# imports from its own install, as Node finds it. Prints the container's id. Run
# on the host.
#
# The file is the only source of the container's settings: the CLI passes them,
# and nothing here names an image, a mount, a run arg or the install. VS Code's
# "Reopen in Container" makes the same CLI call, so both paths find one
# container by the CLI's default label.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
folder=${1:-$root}

c=$(podman ps -aq --filter "label=devcontainer.local_folder=$root" | head -1)

sees() {
  local at mounts
  mounts=$(podman inspect "$1" --format '{{range .Mounts}}{{.Destination}}{{"\n"}}{{end}}') || return 1
  while read -r at; do
    [ -n "$at" ] || continue
    case "$folder/" in "$at"/*) return 0 ;; esac
  done <<<"$mounts"
  return 1
}

# The container sees the folder, and the folder's repo has its install there: a
# container made before mounts no volume over it, and an install there would
# write into the host's folder.
ready() {
  sees "$1" || return 1
  [ -z "$outside" ] || podman inspect "$1" --format '{{range .Mounts}}{{.Destination}}{{"\n"}}{{end}}' | grep -qxF "$top/node_modules"
}

# A short hash of the repo's path, for the deployment volume's source name. The
# file's own volumes are named by the CLI's ${devcontainerId}, not here.
id=$(printf '%s' "$root" | sha256sum | cut -c1-12)

# A folder in a git repo brings the whole repo: a deployment's packages can sit
# beside it (the repo's own packages/), not only inside it.
top=$(git -C "$folder" rev-parse --show-toplevel 2>/dev/null || echo "$folder")

# A repo outside this one, whose packages the container installs.
outside=
case "$top/" in
  "$root"/*) ;;
  *) outside=$top ;;
esac

# The CLI's own call, with the folder to add, bounded so a CLI that never returns cannot hold this one.
cli_up() {
  timeout 900 npx --yes @devcontainers/cli@0.90.0 up --workspace-folder "$root" --docker-path podman \
    --remove-existing-container "${mount[@]}" >&2
}

# Every container for this checkout, whatever made it, so a failure leaves nothing a later run reuses.
remove_container() {
  podman ps -aq --filter "label=devcontainer.local_folder=$root" | xargs -r podman rm -f >/dev/null
}

created=false
if [ -n "$c" ] && ready "$c"; then
  podman start "$c" >/dev/null
else
  mount=()
  if [ -n "$outside" ]; then
    # Its install is a volume of this checkout's, named by a short hash of the repo's path, as before.
    mount=(--mount "type=bind,source=$top,target=$top"
      --mount "type=volume,source=que-deployment-node-modules-$id-$(printf '%s' "$top" | sha256sum | cut -c1-12),target=$top/node_modules")
  fi
  [ -z "$c" ] || echo "The dev container cannot see $folder. Making it again with that folder mounted, which takes a few minutes." >&2
  # The file's install failing is the CLI's non-zero exit. Its container is removed, so the next run makes
  # one and runs the install instead of reusing a half-installed container.
  code=0
  cli_up || code=$?
  # The CLI waits, once it has started the container, for a podman event=start that it can miss: the wait
  # reads every container's events and drops the one it wanted. Its container is made all the same, so a
  # retry is cheap, and a stopped clock is not: 900s is above a create that runs the file's install.
  if [ "$code" -eq 124 ]; then
    echo "The dev container CLI stopped answering. Making the container again." >&2
    remove_container
    code=0
    cli_up || code=$?
  fi
  if [ "$code" -ne 0 ]; then
    remove_container
    exit 1
  fi
  c=$(podman ps -aq --filter "label=devcontainer.local_folder=$root" | head -1)
  created=true
fi
# A new volume starts root-owned. The file's install hands its four to node; the deployment's volume is
# added by this call, so hand it over too before installing there.
if [ "$created" = true ]; then
  volumes=("$root/server/node_modules" "$root/ui/node_modules" "$root/ui/.next" /home/node/.cache)
  [ -z "$outside" ] || volumes+=("$top/node_modules")
  podman exec -u root "$c" chown node:node "${volumes[@]}" >&2
fi
# The outside repo's install, made again when its lockfile changes.
if [ -n "$outside" ] && [ -f "$top/package-lock.json" ]; then
  lock=$(sha256sum "$top/package-lock.json" | cut -c1-12)
  # shellcheck disable=SC2016 # The script is for the container's shell, which expands it.
  podman exec -u node -w "$top" "$c" sh -c '[ "$(cat node_modules/.que-lock 2>/dev/null)" = "$1" ] || { npm ci && echo "$1" > node_modules/.que-lock; }' sh "$lock" >&2
fi
echo "$c"
