#!/usr/bin/env bash
# shellcheck disable=SC2329 # A function here is called by name: a case by the loop at the end, the rest by a case.
# shellcheck disable=SC2312 # An assertion reads a command's output; its exit is the assertion's, not the command's.
# The tests of scripts/dev-image.sh, on one machine, with no image, no registry and no network. Each
# case makes a temp git repo that holds the four inputs and a copy of the script, and puts stand-in
# `skopeo` and `podman` first on PATH. Each stand-in appends its arguments as one line to $T/calls.
# The registry is $T/registry, one `<tag> <digest>` per line: `skopeo inspect` answers a tag listed
# there, and `skopeo copy` and `podman push` add their target tag to it. The smoke is a stand-in too
# (DEV_IMAGE_SMOKE), which exits $SMOKE_EXIT.
# Run it from anywhere: scripts/dev-image.test.sh. One ok or not ok line per case, exit 1 if any fails.
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd -P)
script=$here/dev-image.sh
name_=example.test/que-dev
inputs=(.devcontainer/devcontainer.json .devcontainer/Containerfile server/package-lock.json ui/package-lock.json)

# given: a git repo with the four inputs committed, and the stand-ins on PATH.
given_repo() {
  T=$(mktemp -d) || return 1
  repo=$T/repo
  mkdir -p "$repo/scripts" "$repo/.devcontainer" "$repo/server" "$repo/ui" "$T/bin" || return 1
  cp "$script" "$repo/scripts/dev-image.sh" || return 1
  for f in "${inputs[@]}"; do echo "$f v1" >"$repo/$f"; done
  echo readme >"$repo/README.md"
  git -C "$repo" init -q &&
    git -C "$repo" -c user.email=t@t -c user.name=t add -A &&
    git -C "$repo" -c user.email=t@t -c user.name=t commit -qm init || return 1
  : >"$T/calls"
  : >"$T/registry"
  : >"$T/local"
  cat >"$T/bin/skopeo" <<'STUB'
#!/usr/bin/env bash
# A stand-in for skopeo: inspect answers a tag in $T/registry; copy adds its target to it.
echo "skopeo $*" >>"$T/calls"
case $1 in
inspect)
  ref=${!#}; ref=${ref#docker://}
  d=$(awk -v r="$ref" '$1 == r {print $2}' "$T/registry" | tail -1)
  [ -n "$d" ] || { echo "manifest unknown: $ref" >&2; exit 1; }
  echo "$d"
  ;;
copy)
  src=${*: -2:1}; dst=${!#}; src=${src#docker://}; dst=${dst#docker://}
  d=$(awk -v r="$src" '$1 == r {print $2}' "$T/registry" | tail -1)
  [ -n "$d" ] || exit 1
  echo "$dst $d" >>"$T/registry"
  ;;
esac
STUB
  cat >"$T/bin/podman" <<'STUB'
#!/usr/bin/env bash
# A stand-in for podman: push adds the tag to $T/registry with a new digest; build, and pull of a tag
# in the registry, add it to the local store, $T/local; `image exists` reads that store.
echo "podman $*" >>"$T/calls"
case $1 in
push) echo "$2 sha256:$(echo "$2" | sha256sum | cut -c1-64)" >>"$T/registry" ;;
build) echo "${*: -2:1}" >>"$T/local" ;;
pull) awk -v r="$2" '$1 == r {f=1} END {exit !f}' "$T/registry" && echo "$2" >>"$T/local" || exit 1 ;;
image) [ "$2" = exists ] && grep -qxF -- "$3" "$T/local" ;;
esac
STUB
  cat >"$T/smoke" <<'STUB'
#!/usr/bin/env bash
echo "smoke $*" >>"$T/calls"
exit "${SMOKE_EXIT:-0}"
STUB
  chmod +x "$T/bin/skopeo" "$T/bin/podman" "$T/smoke" || return 1
  export T PATH="$T/bin:$PATH" DEV_IMAGE=$name_ DEV_IMAGE_SMOKE=$T/smoke SMOKE_EXIT=0
}

commit() { git -C "$repo" -c user.email=t@t -c user.name=t commit -qam "$1"; }
digest() { echo "sha256:$(printf '%064d' "$1")"; }

# when <command>: runs the script in the repo; sets out, err and code.
when() {
  out=$("$repo/scripts/dev-image.sh" "$1" 2>"$T/err")
  code=$?
  err=$(cat "$T/err")
}
hash_now() { "$repo/scripts/dev-image.sh" hash 2>/dev/null; }

miss() {
  echo "not ok - $name"
  printf '  %s\n' "$@"
  printf '  | stdout: %s\n  | stderr: %s\n' "$out" "$err"
  sed 's/^/  | call: /' "$T/calls"
  return 1
}
then_is() { [ "$2" = "$3" ] || miss "$1: expected $(printf %q "$2"), got $(printf %q "$3")"; }
then_has() { grep -qF -- "$2" <<<"$3" || miss "$1: expected to hold $(printf %q "$2")"; }
then_lacks() { ! grep -qF -- "$2" <<<"$3" || miss "$1: expected not to hold $(printf %q "$2")"; }
calls() { cat "$T/calls"; }
pass() { echo "ok - $name"; }

# --- hash ---

test_hash_is_stable() {
  name="hash prints the same 16 hex characters twice"
  given_repo || return 1
  when hash
  first=$out
  when hash
  then_is "the exit" 0 "$code" &&
    then_is "the second hash" "$first" "$out" &&
    { [[ $out =~ ^[0-9a-f]{16}$ ]] || miss "the hash: expected 16 lowercase hex, got $out"; } &&
    pass
}

test_hash_fails_on_a_missing_input() {
  name="hash fails, naming the input, when one is missing"
  given_repo || return 1
  git -C "$repo" rm -q ui/package-lock.json && commit "rm" || return 1
  when hash
  { [ "$code" -ne 0 ] || miss "the exit: expected non-zero, got 0"; } &&
    then_has "stderr" "ui/package-lock.json" "$err" &&
    pass
}

test_hash_follows_each_input() {
  name="hash changes when any one of the four inputs changes"
  given_repo || return 1
  for f in "${inputs[@]}"; do
    before=$(hash_now)
    echo "$f changed" >>"$repo/$f" && commit "$f" || return 1
    after=$(hash_now)
    [ "$before" != "$after" ] || { miss "the hash did not change with $f"; return 1; }
  done
  pass
}

test_hash_ignores_other_files() {
  name="hash stays the same when only README.md changes"
  given_repo || return 1
  before=$(hash_now)
  [ -n "$before" ] || { miss "the hash: expected one, got none"; return 1; }
  echo more >>"$repo/README.md" && commit readme || return 1
  then_is "the hash" "$before" "$(hash_now)" && pass
}

# --- ensure ---

test_ensure_builds_nothing_when_the_tag_exists() {
  name="ensure builds nothing when ghcr has the tag, and moves no :main"
  given_repo || return 1
  h=$(hash_now)
  echo "$name_:$h $(digest 7)" >>"$T/registry"
  when ensure
  then_is "the exit" 0 "$code" &&
    then_lacks "the calls" "podman build" "$(calls)" &&
    then_lacks "the calls" "podman push" "$(calls)" &&
    then_lacks "the calls" "smoke" "$(calls)" &&
    then_lacks "the calls" "skopeo copy" "$(calls)" &&
    then_is "stdout's last line" "$name_@$(digest 7)" "$(tail -1 <<<"$out")" &&
    then_has "stderr" "$name_:$h exists: not built" "$err" &&
    pass
}

test_ensure_builds_smokes_and_pushes_when_the_tag_is_missing() {
  name="ensure builds, smokes and pushes, in order, and moves no :main, when the tag is missing"
  given_repo || return 1
  h=$(hash_now)
  when ensure
  want=$(printf '%s\n' \
    "podman build -f .devcontainer/Containerfile -t $name_:$h ." \
    "smoke $name_:$h" \
    "podman push $name_:$h")
  got=$(grep -E '^(podman (build|push)|smoke|skopeo copy)' "$T/calls")
  then_is "the exit" 0 "$code" &&
    then_is "the calls, in order" "$want" "$got" &&
    then_lacks "the calls" "skopeo copy" "$(calls)" &&
    pass
}

test_ensure_moves_nothing_on_a_failed_smoke() {
  name="ensure pushes nothing and moves nothing when the smoke fails"
  given_repo || return 1
  export SMOKE_EXIT=1
  when ensure
  { [ "$code" -ne 0 ] || miss "the exit: expected non-zero, got 0"; } &&
    then_lacks "the calls" "podman push" "$(calls)" &&
    then_lacks "the calls" "skopeo copy" "$(calls)" &&
    pass
}

# --- promote ---

test_promote_points_main_at_the_commits_tag() {
  name="promote points :main at the commit's tag, keeping its digest"
  given_repo || return 1
  h=$(hash_now)
  echo "$name_:$h $(digest 3)" >>"$T/registry"
  when promote
  then_is "the exit" 0 "$code" &&
    then_has "the calls" "skopeo copy --preserve-digests docker://$name_:$h docker://$name_:main" "$(calls)" &&
    then_is "the ref" "$name_@$(digest 3)" "$(tail -1 <<<"$out")" &&
    pass
}

test_promote_fails_when_the_tag_is_missing() {
  name="promote fails, and moves nothing, when ghcr lacks the commit's tag"
  given_repo || return 1
  when promote
  { [ "$code" -ne 0 ] || miss "the exit: expected non-zero, got 0"; } &&
    then_lacks "the calls" "skopeo copy" "$(calls)" &&
    then_has "stderr" "$name_:$(hash_now)" "$err" &&
    pass
}

# --- local ---

test_local_uses_the_machines_copy() {
  name="local prints the commit's tag and pulls and builds nothing when this machine has it"
  given_repo || return 1
  h=$(hash_now)
  echo "$name_:$h" >>"$T/local"
  when local
  then_is "the exit" 0 "$code" &&
    then_is "the image" "$name_:$h" "$out" &&
    then_lacks "the calls" "podman pull" "$(calls)" &&
    then_lacks "the calls" "podman build" "$(calls)" &&
    pass
}

test_local_pulls_from_ghcr() {
  name="local pulls the commit's tag when ghcr has it, and builds nothing"
  given_repo || return 1
  h=$(hash_now)
  echo "$name_:$h $(digest 4)" >>"$T/registry"
  when local
  then_is "the exit" 0 "$code" &&
    then_is "the image" "$name_:$h" "$out" &&
    then_has "the calls" "podman pull $name_:$h" "$(calls)" &&
    then_lacks "the calls" "podman build" "$(calls)" &&
    pass
}

test_local_builds_when_no_one_has_it() {
  name="local builds and smokes the commit's tag when neither this machine nor ghcr has it, and pushes nothing"
  given_repo || return 1
  h=$(hash_now)
  when local
  then_is "the exit" 0 "$code" &&
    then_is "the image" "$name_:$h" "$out" &&
    then_has "the calls" "podman build -f .devcontainer/Containerfile -t $name_:$h ." "$(calls)" &&
    then_has "the calls" "smoke $name_:$h" "$(calls)" &&
    then_lacks "the calls" "podman push" "$(calls)" &&
    then_lacks "the calls" "skopeo copy" "$(calls)" &&
    pass
}

test_local_fails_on_a_failed_smoke() {
  name="local fails when the image it built fails its smoke"
  given_repo || return 1
  export SMOKE_EXIT=1
  when local
  { [ "$code" -ne 0 ] || miss "the exit: expected non-zero, got 0"; } && pass
}

# --- ref ---

test_ref_prefers_the_commits_own_tag() {
  name="ref prints the digest of the commit's tag over :main's"
  given_repo || return 1
  h=$(hash_now)
  printf '%s\n' "$name_:$h $(digest 1)" "$name_:main $(digest 2)" >>"$T/registry"
  when ref
  then_is "the exit" 0 "$code" && then_is "the ref" "$name_@$(digest 1)" "$out" && pass
}

test_ref_falls_back_to_main() {
  name="ref prints :main's digest when the commit's tag is missing"
  given_repo || return 1
  echo "$name_:main $(digest 2)" >>"$T/registry"
  when ref
  then_is "the exit" 0 "$code" && then_is "the ref" "$name_@$(digest 2)" "$out" && pass
}

test_ref_fails_when_neither_exists() {
  name="ref fails, naming both tags, when neither exists"
  given_repo || return 1
  h=$(hash_now)
  when ref
  { [ "$code" -ne 0 ] || miss "the exit: expected non-zero, got 0"; } &&
    then_has "stderr" "$name_:$h" "$err" &&
    then_has "stderr" "$name_:main" "$err" &&
    pass
}

# Each case in its own subshell, so its exports and its folder stay its own.
failed=0
for t in $(declare -F | awk '$3 ~ /^test_/ {print $3}'); do
  ("$t"; rc=$?; [ -z "${T:-}" ] || rm -rf "$T"; exit "$rc") || failed=1
done
exit "$failed"
