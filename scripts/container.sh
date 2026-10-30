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
# - --foreground: `timeout` otherwise puts the CLI in a background process group of the terminal, where its
#   first touch of the terminal stops the whole group, and Ctrl-C never reaches it.
# - no terminal on stdin: on one, the CLI runs the install on a terminal of its own, and takes Ctrl-C there
#   as an interrupted install and a success, leaving a half-installed container.
# - containers.conf: on the journald backend the CLI's wait for the start event can miss it (see that file).
cli_up() {
  local follower code=0
  # The CLI writes to a file, and the file is followed: a pipe would stay open as long as any podman call it
  # left behind, and hold whoever reads this script's output.
  tail -n +1 -f --pid=$$ "$cli_log" >&2 &
  follower=$!
  CONTAINERS_CONF_OVERRIDE=$root/scripts/containers.conf timeout --foreground 900 \
    npx --yes @devcontainers/cli@0.90.0 up --workspace-folder "$root" --docker-path podman \
    --remove-existing-container "${mount[@]}" </dev/null >>"$cli_log" 2>&1 || code=$?
  kill "$follower" 2>/dev/null || true
  return "$code"
}

# With --foreground, the bound signals npx only. npx may take the CLI down with it, and the podman calls under
# the CLI then have no parent to be found by, so each is found by what it is: this checkout's CLI and its
# `podman run`, and any `podman events` that init has taken over, which no live CLI reads.
stop_cli() {
  local orphans
  pkill -KILL -f "up --workspace-folder $root( |\$)" || true
  pkill -KILL -f "podman run .*source=$root,target=$root," || true
  orphans=$(ps -eo pid=,ppid=,args= | awk '$2 == 1 && $3 == "podman" && $4 == "events" { print $1 }')
  # shellcheck disable=SC2086 # Each pid is one word, and none is no call.
  [ -z "$orphans" ] || kill -KILL $orphans 2>/dev/null || true
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
  # A create that is stopped rather than failing, by TERM, HUP or a closed terminal, leaves a container
  # whose install never finished. It goes with this script, so the next run makes one and runs the install
  # instead of taking the start branch and checking a half-installed folder.
  cli_log=$(mktemp)
  trap 'remove_container; rm -f "$cli_log"' EXIT
  # The file's install failing is the CLI's non-zero exit. Its container is removed, so the next run makes
  # one and runs the install instead of reusing a half-installed container.
  code=0
  cli_up || code=$?
  # The bound is above a create that runs the file's install. A call it cuts before any install is cheap to
  # make again. A call it cuts in an install is not: that is an install too slow for the bound, and running
  # it again throws its work away.
  if [ "$code" -eq 124 ]; then
    stop_cli
    if grep -q 'Running the [A-Za-z]*Command from' "$cli_log"; then
      echo "The dev container CLI's install ran past its bound. The install is not run again." >&2
      exit 1
    fi
    echo "The dev container CLI stopped answering. Making the container again." >&2
    remove_container
    code=0
    cli_up || code=$?
  fi
  [ "$code" -eq 0 ] || exit 1
  trap - EXIT
  rm -f "$cli_log"
  c=$(podman ps -aq --filter "label=devcontainer.local_folder=$root" | head -1)
  created=true
fi
# A new volume starts root-owned. The file's install hands its own four to node; the deployment's volume is
# added by this call and not named by the file, so it is this script's to hand over before installing there.
if [ "$created" = true ] && [ -n "$outside" ]; then
  podman exec -u root "$c" chown node:node "$top/node_modules" >&2
fi
# The outside repo's install, made again when its lockfile changes.
if [ -n "$outside" ] && [ -f "$top/package-lock.json" ]; then
  lock=$(sha256sum "$top/package-lock.json" | cut -c1-12)
  # shellcheck disable=SC2016 # The script is for the container's shell, which expands it.
  podman exec -u node -w "$top" "$c" sh -c '[ "$(cat node_modules/.que-lock 2>/dev/null)" = "$1" ] || { npm ci && echo "$1" > node_modules/.que-lock; }' sh "$lock" >&2
fi
echo "$c"
