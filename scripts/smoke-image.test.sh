#!/usr/bin/env bash
# shellcheck disable=SC2329 # A function here is called by name: a case by the loop at the end, the rest by a case.
# The tests of the smoke check's git step (scripts/smoke-image.sh), on one machine, with no image,
# no build and no container. The step's only input is what the container engine answers to
# `run ... find`, so a stand-in engine runs the real `find` over a tree that stands for the image's
# root, as the user the step asks for. A folder that holds a `.root-only` marker stands for a folder
# only root can enter: as root the stand-in reads it, as any other user it does not, and find exits 1
# as it does on a folder it cannot read. The marker is plain userland, so the test needs no user
# namespace and no privilege, and runs the same on every machine. A `.git` that only root can read is
# what `COPY .git` from a checkout under `umask 077` gives the image, and the case puts it in a folder
# only root can enter, so `find` as any other user cannot reach it: that is what the step's user
# decides. That a real root reads every folder is the container engine's guarantee, not the step's.
# Run it from anywhere: scripts/smoke-image.test.sh. One ok or not ok line per case, exit 1 if any fails.
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd -P)
smoke=$here/smoke-image.sh

# given: a folder that stands for the image's root, and a stand-in engine that runs a step there.
# $1 is the image's .git: `root` (only root can read it), `readable` (a process can), or `none`.
given_image() {
  T=$(mktemp -d) || return 1
  root=$T/image
  engine=$T/podman
  export SMOKE_IMAGE_ROOT=$root
  mkdir -p "$root/app" "$root/root" || return 1
  # The image's /root is 0700 and root's: a process in the image cannot search it.
  : >"$root/root/.root-only" || return 1
  # root: the .git sits in a folder only root can enter, so a process that is not root cannot
  # reach it: `find` stats `app/.git` in a readable folder and prints it either way, so only a
  # folder it cannot enter makes the step's user decide the case.
  case $1 in
  root)
    mkdir -p "$root/app/locked/.git" || return 1
    : >"$root/app/locked/.root-only" || return 1
    ;;
  readable) mkdir -p "$root/app/.git/objects" || return 1 ;;
  none) ;;
  *)
    echo "smoke-image.test.sh: unknown image $1" >&2
    return 1
    ;;
  esac
  cat >"$engine" <<'ENGINE'
#!/usr/bin/env bash
# A stand-in for the container engine. `image exists` answers yes, so a step runs. `run` runs the
# command it is given in the folder that stands for the image's root ($SMOKE_IMAGE_ROOT), as the
# user the step asks for: root reads every folder, and any other user cannot enter a folder that
# holds a `.root-only` marker. Only `find` is run, so a step that asks for another command exits 2 here and its case
# fails loud, rather than reading as a pass.
set -uo pipefail
case ${1:-} in
image)
    [ "${2:-}" = exists ] || exit 1
    exit 0
    ;;
run) ;;
*)
    echo "engine stand-in: unknown command ${1:-}" >&2
    exit 2
    ;;
esac
shift
user=
while [ $# -gt 0 ]; do
    case $1 in
    --user | -u)
        user=${2:-}
        shift 2
        ;;
    --user=*)
        user=${1#--user=}
        shift
        ;;
    --rm | --detach | --interactive | --tty | -d | -i | -t) shift ;;
    -*) shift ;;
    *) break ;;
    esac
done
[ $# -gt 0 ] || {
    echo "engine stand-in: run with no image" >&2
    exit 2
}
shift # the image
[ "${1:-}" = find ] || {
    echo "engine stand-in: runs find only, and the step asked for ${1:-}" >&2
    exit 2
}
args=()
for arg in "$@"; do
    [ "$arg" = / ] && arg=$SMOKE_IMAGE_ROOT
    args+=("$arg")
done
[ "$user" = root ] && exec "${args[@]}"
# Not root: a folder that holds a marker is one this user cannot enter. find names it on stderr, does
# not print what is in it, and exits 1, as find does on a folder it cannot read.
mapfile -t locked < <(find "$SMOKE_IMAGE_ROOT" -name .root-only -printf '%h\n')
for dir in "${locked[@]}"; do echo "find: '$dir': Permission denied" >&2; done
"${args[@]}" | while IFS= read -r path; do
    for dir in "${locked[@]}"; do
        case $path in "$dir"/*) continue 2 ;; esac
    done
    printf '%s\n' "$path"
done
status=${PIPESTATUS[0]}
[ "$status" -ne 0 ] && exit "$status"
[ "${#locked[@]}" -eq 0 ] || exit 1
ENGINE
  chmod +x "$engine" || return 1
}

# when: the git step of the smoke check, against the image the case made.
when_git() {
  out=$(QUE_SMOKE_ENGINE=$engine timeout 300 "$smoke" que:smoke git 2>&1)
  code=$?
}

# then <what> <expected> <actual>: one assertion. On a miss it prints what was expected, what came,
# and the step's output.
then_is() {
  [ "$2" = "$3" ] && return 0
  echo "not ok - $name"
  printf '  %s: expected %q, got %q\n' "$1" "$2" "$3"
  step_output
  return 1
}

# then_says <what> <extended regex>: the step's output, which says why it failed.
then_says() {
  grep -qE -- "$2" <<<"$out" && return 0
  echo "not ok - $name"
  printf '  %s: expected the output to match %q\n' "$1" "$2"
  step_output
  return 1
}

# The step's output, a line each, marked so it is not read as this file's own.
step_output() {
  local line
  while IFS= read -r line; do echo "  | $line"; done <<<"$out"
}

pass() { echo "ok - $name"; }

# --- a .git only root can read: the cut's check fails, and says where ---

test_a_git_that_only_root_can_read_fails_the_step() {
  name="an image whose .git only root can reach fails the git step, which names it"
  given_image root || return 1
  when_git
  then_is "the step's exit" 1 "$code" &&
    then_says "the .git it found" "holds a \.git at: .*/app/locked/\.git" &&
    pass
}

# --- no .git: the check passes, and an unreadable folder is no fault of the image ---

test_an_image_with_no_git_passes_the_step() {
  name="an image with no .git, and a folder only root can read, passes the git step"
  given_image none || return 1
  when_git
  then_is "the step's exit" 0 "$code" &&
    then_says "what the step says of the image" "the image passed the smoke check" &&
    pass
}

# --- a .git a process can read: still the cut's check, and still the same failure ---

test_a_git_a_process_can_read_fails_the_step() {
  name="an image whose .git a process can read fails the git step, which names it"
  given_image readable || return 1
  when_git
  then_is "the step's exit" 1 "$code" &&
    then_says "the .git it found" "holds a \.git at: .*/app/\.git" &&
    pass
}

# Each case in its own subshell, so its exports and its folder stay its own.
failed=0
for t in $(declare -F | awk '$3 ~ /^test_/ {print $3}'); do
  ("$t"; rc=$?; [ -z "${T:-}" ] || rm -rf "$T"; exit "$rc") || failed=1
done
exit "$failed"
