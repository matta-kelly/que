#!/usr/bin/env bash
# shellcheck disable=SC2312
# The integration tests for que's dev container. que's container is made from
# .devcontainer/devcontainer.json through the dev container CLI, with the deployment folder it must see
# given to it, so these drive the real podman, the real CLI and the real `just` recipes, and they check
# what the running machine gives: the file's settings in `podman inspect`, the CLI's label, the volumes
# the CLI names, the deployment's own bind and volume, and the installs it runs.
#
# Run them on the host: `scripts/container-check.sh`, or `scripts/container-check.sh <name>...` for some
# of them, and `scripts/container-check.sh --list` to list them. They destroy and remake this checkout's
# container and the volumes it mounts, so do not run them under a session that is using the container.
# They touch no other checkout's container or volumes, no service container, and no tag.
#
# They are not a step of scripts/check.sh: that file runs inside the container, where podman is not, and
# its steps stay as they are. Where they cannot run they say why and exit 0: a machine with no podman
# (the pipeline's runner), or a container.
set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
label="devcontainer.local_folder=$root"
# The version the machine has. The CLI names the container's volumes, so the tests hold one version, not
# whatever a later one would answer.
CLI=(npx --yes @devcontainers/cli@0.90.0)
CAP=3000000000
SHARES=256
FILE="$root/.devcontainer/devcontainer.json"
# A short hash of the checkout's path, the way scripts/container.sh names que's own volumes today. It is
# used only to clean up after runs that made them, never as an expected value.
OWN_HASH=$(printf '%s' "$root" | sha256sum | cut -c1-12)

skip() {
  echo "SKIP: $*"
  exit 0
}

[ ! -e /run/.containerenv ] && [ ! -e /.dockerenv ] ||
  skip "inside a container, where podman is not; run the container tests on the host"
for cmd in podman just jq npx git sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 ||
    skip "the container tests need $cmd on the host; the pipeline runs scripts/check.sh with no podman and no dev container CLI"
done

# The fixture sits on the host's real disk, outside this worktree, never /tmp: /tmp is RAM here, and the
# container's private user namespace cannot enter a mode-700 folder under it. It is open to every user so
# the container's `node` can make the deployment's node_modules inside it.
tmp=$(mktemp -d "$(dirname "$root")/c5-fixture.XXXXXX")
chmod 777 "$tmp"
trap 'rm -rf "$tmp"' EXIT

# The tracked file a test changes, and the copy it is restored from. The copy and the restore are global,
# and the copy sits outside $tmp: a test's own names are gone by the time the EXIT trap runs, so a trap
# over a `local` would die unbound and leave the worktree's file changed. The trap stays armed through the
# assertions: it restores after a failure as well as on the way to them.
backup=
restore_file() {
  [ -n "$backup" ] || return 0
  cp "$backup" "$FILE" || return 1
  rm -f "$backup"
  backup=
}

# The deployment the tests hand the maker: a copy of the template in a git repo of its own, outside que,
# with a lockfile so the maker installs from one. `git init` makes its repo root the folder itself, so the
# repo the container must see is the deployment's folder, bound at its own path.
dep="$tmp/deployment"
make_deployment() {
  rm -rf "$dep"
  cp -r "$root/templates/deployment" "$dep" || return 1
  chmod 777 "$dep" || return 1
  git -C "$dep" init -q || return 1
  # One dependency, so `npm ci` makes node_modules and the maker's install leaves something a probe can
  # outlive or not. Its lockfile is written here, so the test needs no npm on the host.
  cat >"$dep/package.json" <<'EOF'
{
  "name": "my-deployment",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "is-number": "7.0.0"
  }
}
EOF
  cat >"$dep/package-lock.json" <<'EOF'
{
  "name": "my-deployment",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "my-deployment",
      "version": "1.0.0",
      "dependencies": {
        "is-number": "7.0.0"
      }
    },
    "node_modules/is-number": {
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz",
      "integrity": "sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==",
      "license": "MIT",
      "engines": {
        "node": ">=0.12.0"
      }
    }
  }
}
EOF
}

# --- the machine, read ---

# The id of this checkout's container, or empty. Read by the label the CLI sets by default, so nothing
# here depends on the CLI's name for it.
cid() {
  podman ps -a --filter "label=$label" --format '{{.ID}}' | head -1
}

# The same container's full id, the id the CLI returns and just's recipes reach.
cid_full() {
  podman inspect --format '{{.Id}}' "$(cid)" 2>/dev/null || true
}

count() {
  podman ps -a --filter "label=$label" --format '{{.ID}}' | wc -l
}

field() {
  podman inspect --format "$2" "$1"
}

running() {
  [ "$(field "$1" '{{.State.Running}}')" = "true" ]
}

# The destinations of the volumes the container mounts, one per line, sorted. podman adds its own
# trailing newline, so the template's last `println` would leave a blank line; drop it here.
volume_destinations() {
  field "$1" '{{range .Mounts}}{{if eq .Type "volume"}}{{.Destination}}{{println}}{{end}}{{end}}' |
    sed '/^$/d' |
    sort
}

# The names of the volumes the container mounts, one per line, sorted.
volume_names() {
  field "$1" '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{println}}{{end}}{{end}}' |
    sed '/^$/d' |
    sort
}

# The name of the volume the container mounts at a destination.
volume_at() {
  field "$1" "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Name}}{{end}}{{end}}"
}

# The name seam 3 gives the deployment's volume: que's checkout hash, then the deployment repo's hash. It
# is not in the file, so `down` leaves it, and the container that replaces this one mounts it again.
deployment_volume_name() {
  printf 'que-deployment-node-modules-%s-%s' "$OWN_HASH" "$(printf '%s' "$dep" | sha256sum | cut -c1-12)"
}

# The configuration the CLI reads from the file, with ${containerWorkspaceFolder} substituted, and
# ${devcontainerId} substituted while a container for the folder exists. Prints the CLI's JSON.
config() {
  "${CLI[@]}" read-configuration --workspace-folder "$root" --docker-path podman 2>/dev/null
}

# The names the file gives this checkout's own volumes, one per line, sorted. Read through the CLI, so the
# tokens are the ones the file holds.
file_volume_names() {
  config |
    jq -r '.configuration.mounts[]? | capture("source=(?<source>[^,]+)").source' |
    sort
}

# The call VS Code makes: the CLI for this folder, with no settings of its own, so the file's settings are
# all it has. Prints the CLI's JSON.
cli_up() {
  "${CLI[@]}" up --workspace-folder "$root" --docker-path podman
}

# Remove this checkout's container and the volumes it mounts, however it was made, so each test starts on
# a bare folder. A volume is this checkout's when it sits at one of the four targets the file names, or when
# its name is the deployment's seam-3 name for this checkout (the deployment folder moves between runs, so
# its name, not its destination, is what says whose it is). Every other checkout's container and volumes,
# and every service volume, are left alone.
clean() {
  local id pair name dest v pairs
  for id in $(podman ps -aq --filter "label=$label"); do
    field "$id" '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}={{.Destination}} {{end}}{{end}}' >"$tmp/mounts"
    podman rm -f "$id" >/dev/null 2>&1 || true
    read -ra pairs <"$tmp/mounts" || true
    for pair in "${pairs[@]}"; do
      name=${pair%%=*}
      dest=${pair#*=}
      case "$dest" in
        "$root/server/node_modules" | "$root/ui/node_modules" | "$root/ui/.next" | /home/node/.cache)
          podman volume rm -f "$name" >/dev/null 2>&1 || true
          ;;
      esac
      case "$name" in
        "que-deployment-node-modules-$OWN_HASH-"*)
          podman volume rm -f "$name" >/dev/null 2>&1 || true
          ;;
      esac
    done
  done
  # Names a run may have left with no container: que's own script's, and this checkout's deployment volumes.
  for v in "que-node-modules-$OWN_HASH" "que-ui-node-modules-$OWN_HASH" "que-cache-$OWN_HASH" \
    "que-ui-next-$OWN_HASH"; do
    podman volume rm -f "$v" >/dev/null 2>&1 || true
  done
  while read -r v; do
    [ -n "$v" ] && podman volume rm -f "$v" >/dev/null 2>&1
  done < <(podman volume ls --format '{{.Name}}' | grep "^que-deployment-node-modules-$OWN_HASH-" || true)
}

# --- assertions ---

fail() {
  printf '  %s\n' "$*" >&2
  return 1
}

assert_eq() {
  [ "$1" = "$2" ] && return 0
  fail "$3: expected [$1], got [$2]"
}

assert_ne() {
  [ "$1" != "$2" ] && return 0
  fail "$3: expected a value other than [$1]"
}

assert_contains() {
  case "$1" in *"$2"*) return 0 ;; esac
  fail "$3: expected to contain [$2], got [$1]"
}

# Given a container, when it is read, then the CLI made it from the file: its image is the one the CLI
# builds, not a podman run of que's own.
assert_made_by_the_cli() {
  local image
  image=$(field "$1" '{{.ImageName}}')
  case "$image" in
    vsc-que-*) return 0 ;;
  esac
  fail "the container is not the one the CLI makes from the file: image [$image], expected vsc-que-*"
}

# --- the behaviors ---

# Given a checkout with no container, when `just check` runs with no deployment, then the container it
# makes is the file's: the CLI's image, the file's CPU cap and shares, the host network, the repo bound
# at its host path, and the four volumes under the names the file gives this checkout.
test_a_fresh_container_from_just_check_has_the_files_cap_and_mounts() {
  cd "$root" || return 1
  clean
  local out code id binds expected mounts expected_names names
  out=$(just check 2>&1)
  code=$?
  assert_eq 0 "$code" "just check passes: $out" || return 1
  assert_eq 1 "$(count)" "just check leaves one container for the folder" || return 1
  id=$(cid)
  assert_eq "$CAP" "$(field "$id" '{{.HostConfig.NanoCpus}}')" "the container has the file's CPU cap" || return 1
  assert_eq "$SHARES" "$(field "$id" '{{.HostConfig.CpuShares}}')" "the container has the file's CPU shares" || return 1
  assert_eq host "$(field "$id" '{{.HostConfig.NetworkMode}}')" "the container has the file's host network" || return 1
  assert_made_by_the_cli "$id" || return 1
  binds=$(field "$id" '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}={{.Destination}} {{end}}{{end}}')
  assert_contains "$binds" "$root=$root" "the workspace is bound at its host path" || return 1
  expected=$(printf '%s\n' \
    "$root/server/node_modules" "$root/ui/node_modules" "$root/ui/.next" /home/node/.cache | sort)
  mounts=$(volume_destinations "$id")
  assert_eq "$expected" "$mounts" "the container mounts the file's four volumes at its four targets" || return 1
  names=$(volume_names "$id")
  expected_names=$(file_volume_names)
  assert_eq "$expected_names" "$names" "the four volumes are the ones the file names with \${devcontainerId}" || return 1
}

# Given a container `just check` made with que's own folder alone, when `just check-deployment` runs on a
# deployment outside que, then the maker remakes the container to see that folder: it is bound at its own
# path, its node_modules is a volume under seam 3's name, and the file's four volumes are still there.
test_check_remakes_when_the_deployment_is_new_and_binds_it_with_its_volume() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id binds first expected
  out=$(just check 2>&1)
  code=$?
  assert_eq 0 "$code" "just check passes: $out" || return 1
  first=$(cid)
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "just check-deployment passes on the deployment: $out" || return 1
  id=$(cid)
  assert_made_by_the_cli "$id" || return 1
  assert_ne "$first" "$id" "the container was made again to see the deployment's folder" || return 1
  binds=$(field "$id" '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}={{.Destination}} {{end}}{{end}}')
  assert_contains "$binds" "$dep=$dep" "the deployment's repo is bound at its own path" || return 1
  expected=$(printf '%s\n' \
    "$root/server/node_modules" "$root/ui/node_modules" "$root/ui/.next" /home/node/.cache \
    "$dep/node_modules" | sort)
  assert_eq "$expected" "$(volume_destinations "$id")" "the container mounts the file's four volumes and the deployment's" || return 1
  assert_eq "$(deployment_volume_name)" "$(volume_at "$id" "$dep/node_modules")" \
    "the deployment's volume keeps the source name seam 3 gives" || return 1
}

# Given a container the maker made for a deployment, when the call VS Code makes runs for the same folder,
# then the two paths keep one container: the bare up returns the id just's recipes reach, and one exists.
test_one_container_for_vscode_and_just() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id vscode
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "just check-deployment passes on the deployment: $out" || return 1
  id=$(cid_full)
  [ -n "$id" ] || {
    fail "the maker left no container for the folder"
    return 1
  }
  assert_made_by_the_cli "$id" || return 1
  out=$(cli_up)
  code=$?
  assert_eq 0 "$code" "the call VS Code makes, a bare up, succeeds: $out" || return 1
  vscode=$(jq -r .containerId <<<"$out")
  assert_eq "$id" "$vscode" "the bare up returns the container just's recipes reach" || return 1
  assert_eq 1 "$(count)" "one container exists for the folder" || return 1
}

# Given a container the maker made, when just's recipes ask for it, then they find it by the CLI's label
# and not by a name: `just _container` gives its id, and `just down` stops it. `just logs` asks the same
# `_container`, and needs a serving que, so it is not driven here.
test_just_finds_the_container_by_the_labels_the_cli_sets() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id found
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "just check-deployment passes on the deployment: $out" || return 1
  id=$(cid_full)
  [ -n "$id" ] || {
    fail "the maker left no container for the folder"
    return 1
  }
  assert_made_by_the_cli "$id" || return 1
  assert_eq "$root" "$(field "$id" '{{index .Labels "devcontainer.local_folder"}}')" \
    "the container carries the label the CLI sets by default" || return 1
  found=$(just _container)
  assert_eq "$id" "$(podman inspect --format '{{.Id}}' "$found" 2>/dev/null)" \
    "just _container gives the container by its label" || return 1
  out=$("$root/scripts/serving-ques.sh")
  assert_eq "" "$out" "serving-ques.sh does not name this checkout as another que" || return 1
  out=$(just down 2>&1)
  code=$?
  assert_eq 0 "$code" "just down finds the container and stops it: $out" || return 1
  if running "$id"; then
    fail "just down left the container running"
    return 1
  fi
}

# Given a container the maker made, when it is inspected and stopped, then `--init` is on it and `podman
# stop` stops it at once, where a container whose first process is `sleep` would wait out the timeout.
test_init_is_on_and_stop_is_immediate() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id started elapsed
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "just check-deployment passes on the deployment: $out" || return 1
  id=$(cid)
  assert_made_by_the_cli "$id" || return 1
  assert_eq true "$(field "$id" '{{.HostConfig.Init}}')" "the container has --init" || return 1
  started=$(date +%s%3N)
  podman stop "$id" >/dev/null || return 1
  elapsed=$(($(date +%s%3N) - started))
  if running "$id"; then
    fail "podman stop left the container running"
    return 1
  fi
  if [ "$elapsed" -ge 5000 ]; then
    fail "podman stop took ${elapsed}ms: the container stops at once only with --init"
    return 1
  fi
}

# Given a container with a deployment's mount, when `just down` runs, then it removes the container and the
# four volumes the file names with ${devcontainerId}, and the deployment's volume stays: it is not in the
# file, as seam 3's rule says.
test_down_removes_the_container_and_the_four_file_volumes_but_not_the_deployments() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id name dep_vol own=()
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "just check-deployment passes on the deployment: $out" || return 1
  id=$(cid)
  [ -n "$id" ] || {
    fail "the maker left no container for the folder"
    return 1
  }
  mapfile -t own < <(volume_names "$id")
  dep_vol=$(volume_at "$id" "$dep/node_modules")
  if [ "${#own[@]}" -ne 5 ]; then
    fail "the container should mount five volumes (the file's four and the deployment's), got ${#own[@]}: ${own[*]}"
    return 1
  fi
  out=$(just down 2>&1)
  code=$?
  assert_eq 0 "$code" "just down exits 0: $out" || return 1
  assert_eq "" "$(cid)" "down removes the container" || return 1
  for name in "${own[@]}"; do
    if [ "$name" = "$dep_vol" ]; then continue; fi
    if podman volume exists "$name"; then
      fail "down did not remove the volume the file names with \${devcontainerId}, $name"
      return 1
    fi
  done
  if ! podman volume exists "$dep_vol"; then
    fail "down removed the deployment's volume, $dep_vol, which the file does not name"
    return 1
  fi
}

# Given the file's install set to false, when the maker runs, then it exits non-zero and leaves no
# container a later run reuses, so the next run makes one and its install runs.
test_the_maker_exits_nonzero_on_a_failed_install_and_leaves_nothing() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id
  backup=$(mktemp "$(dirname "$root")/c5-devcontainer.json.orig.XXXXXX") || return 1
  cp "$FILE" "$backup" || return 1
  trap restore_file EXIT
  sed -i -E 's/("postCreateCommand"[[:space:]]*:[[:space:]]*)"([^"]*)"/\1"false"/' "$FILE"
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  restore_file
  assert_ne 0 "$code" "the maker exits non-zero when the file's install fails" || return 1
  assert_eq "" "$(cid)" "a failed install leaves no container to reuse" || return 1
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "the run after a failed install passes: $out" || return 1
  id=$(cid)
  assert_made_by_the_cli "$id" || return 1
  if ! podman exec "$id" test -f "$root/server/node_modules/.package-lock.json"; then
    fail "the run after a failed install reused a volume with no install in it"
    return 1
  fi
}

# Given the file, when one of its container settings is changed, then the next container has the changed
# value, so the file is the only source of the settings: no script passes one to podman itself.
test_the_file_is_the_only_source_of_the_containers_settings() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id
  backup=$(mktemp "$(dirname "$root")/c5-devcontainer.json.orig.XXXXXX") || return 1
  cp "$FILE" "$backup" || return 1
  trap restore_file EXIT
  sed -i -E 's/("runArgs"[[:space:]]*:[[:space:]]*)\[[^]]*\]/\1["--userns=keep-id:uid=1000,gid=1000", "--network=host", "--cpus=2", "--cpu-shares=128"]/' "$FILE"
  if ! grep -q -- '--cpus=2' "$FILE"; then
    fail "the test could not write its CPU cap into the file's runArgs"
    return 1
  fi
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  restore_file
  assert_eq 0 "$code" "just check-deployment passes with the changed file: $out" || return 1
  id=$(cid)
  assert_eq 2000000000 "$(field "$id" '{{.HostConfig.NanoCpus}}')" \
    "the container has the CPU cap the file now names" || return 1
  assert_eq 128 "$(field "$id" '{{.HostConfig.CpuShares}}')" \
    "the container has the CPU shares the file now names" || return 1
  assert_made_by_the_cli "$id" || return 1
}

# Given a container and the deployment's volume, when the worktree moves over by `just down` and the maker
# again, then the new container has the same mount targets, the file's four volumes are fresh so que's
# install runs, and the deployment's volume is the one from before, so its packages are not installed
# again. The serving that follows `just up` is not driven here: it binds 2024 and 3000, which a live lane
# holds.
test_a_worktree_moves_over_by_down_and_up_keeping_the_deployments_volume() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id1 id2 dep_vol before after
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "just check-deployment passes on the deployment: $out" || return 1
  id1=$(cid)
  [ -n "$id1" ] || {
    fail "the maker left no container for the folder"
    return 1
  }
  dep_vol=$(volume_at "$id1" "$dep/node_modules")
  podman exec -u node "$id1" touch "$root/server/node_modules/.que-install-probe" || return 1
  podman exec -u node "$id1" touch "$dep/node_modules/.deployment-install-probe" || return 1
  before=$(volume_destinations "$id1")
  out=$(just down 2>&1)
  code=$?
  assert_eq 0 "$code" "just down exits 0: $out" || return 1
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "the maker after down passes: $out" || return 1
  id2=$(cid)
  [ -n "$id2" ] || {
    fail "the maker after down left no container"
    return 1
  }
  if podman exec -u node "$id2" test -f "$root/server/node_modules/.que-install-probe"; then
    fail "que's install did not run in the new container's fresh volume"
    return 1
  fi
  if ! podman exec -u node "$id2" test -f "$dep/node_modules/.deployment-install-probe"; then
    fail "the deployment's volume was replaced, so its install ran again"
    return 1
  fi
  after=$(volume_destinations "$id2")
  assert_eq "$before" "$after" "the new container has the same mounts at the same targets" || return 1
  assert_made_by_the_cli "$id2" || return 1
  assert_eq "$dep_vol" "$(volume_at "$id2" "$dep/node_modules")" \
    "the deployment's volume is the one from before" || return 1
}

# Given a deployment with a lockfile, when the maker runs, then the deployment's install runs from its
# lockfile, does not run again while the lockfile is the same, and runs again when the lockfile changes.
test_the_deployments_install_runs_from_its_lockfile_and_again_when_it_changes() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "just check-deployment passes on the deployment: $out" || return 1
  id=$(cid)
  assert_made_by_the_cli "$id" || return 1
  if ! podman exec -u node "$id" test -f "$dep/node_modules/.package-lock.json"; then
    fail "the deployment's install left no node_modules in its volume"
    return 1
  fi
  podman exec -u node "$id" touch "$dep/node_modules/.no-install-probe" || return 1
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "the maker with the same lockfile passes: $out" || return 1
  if ! podman exec -u node "$(cid)" test -f "$dep/node_modules/.no-install-probe"; then
    fail "the deployment's packages were installed again with the lockfile unchanged"
    return 1
  fi
  sed -i 's/"version": "1.0.0"/"version": "1.0.1"/' "$dep/package.json" "$dep/package-lock.json" || return 1
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "the maker with the changed lockfile passes: $out" || return 1
  if podman exec -u node "$(cid)" test -f "$dep/node_modules/.no-install-probe"; then
    fail "the deployment's install did not run again when its lockfile changed"
    return 1
  fi
}

# Given a container with its packages installed, when it is stopped and started and the maker runs again,
# then it is the same container and no install runs: the packages are still in its volumes.
test_a_stop_and_start_reinstalls_nothing() {
  cd "$root" || return 1
  clean
  make_deployment || return 1
  local out code id again
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "just check-deployment passes on the deployment: $out" || return 1
  id=$(cid)
  assert_made_by_the_cli "$id" || return 1
  podman exec -u node "$id" touch "$root/server/node_modules/.no-install-probe" || return 1
  podman stop "$id" >/dev/null || return 1
  podman start "$id" >/dev/null || return 1
  out=$(just check-deployment "$dep" 2>&1)
  code=$?
  assert_eq 0 "$code" "the maker on the started container passes: $out" || return 1
  again=$(cid)
  assert_eq "$id" "$again" "the maker uses the container that was stopped and started" || return 1
  if ! podman exec -u node "$again" test -f "$root/server/node_modules/.no-install-probe"; then
    fail "que's install ran again after a stop and start"
    return 1
  fi
}

# Given que's own code, when `just check` runs with one set and with all, then the check passes in the
# container the file makes, and the second run uses the same container rather than making another.
test_the_check_passes_in_the_container_one_set_and_all() {
  cd "$root" || return 1
  clean
  local out code id
  out=$(just check shell 2>&1)
  code=$?
  assert_eq 0 "$code" "just check shell passes: $out" || return 1
  assert_contains "$out" "== shell: lint" "just check shell runs the shell set" || return 1
  assert_contains "$out" "check passed" "just check shell reaches the end of the check" || return 1
  id=$(cid)
  assert_made_by_the_cli "$id" || return 1
  out=$(just check 2>&1)
  code=$?
  assert_eq 0 "$code" "just check passes: $out" || return 1
  assert_contains "$out" "check passed" "just check reaches the end of the check" || return 1
  assert_eq "$id" "$(cid)" "the check runs in the one container the file makes" || return 1
}

# --- the runner ---

TESTS=(
  test_a_fresh_container_from_just_check_has_the_files_cap_and_mounts
  test_check_remakes_when_the_deployment_is_new_and_binds_it_with_its_volume
  test_one_container_for_vscode_and_just
  test_just_finds_the_container_by_the_labels_the_cli_sets
  test_init_is_on_and_stop_is_immediate
  test_down_removes_the_container_and_the_four_file_volumes_but_not_the_deployments
  test_the_maker_exits_nonzero_on_a_failed_install_and_leaves_nothing
  test_the_file_is_the_only_source_of_the_containers_settings
  test_a_worktree_moves_over_by_down_and_up_keeping_the_deployments_volume
  test_the_deployments_install_runs_from_its_lockfile_and_again_when_it_changes
  test_a_stop_and_start_reinstalls_nothing
  test_the_check_passes_in_the_container_one_set_and_all
)

if [ "${1:-}" = "--list" ]; then
  printf '%s\n' "${TESTS[@]}"
  exit 0
fi

selected=("${TESTS[@]}")
if [ "$#" -gt 0 ]; then
  selected=("$@")
fi

failed=()
for name in "${selected[@]}"; do
  if ! declare -F "$name" >/dev/null; then
    echo "no such test: $name" >&2
    exit 2
  fi
  echo "== $name"
  if (cd "$root" && "$name"); then
    echo "   ok"
  else
    failed+=("$name")
  fi
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo
  echo "failed: ${#failed[@]} of ${#selected[@]}"
  printf '  %s\n' "${failed[@]}"
  exit 1
fi
echo
echo "all ${#selected[@]} container tests passed"
