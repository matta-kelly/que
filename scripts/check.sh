#!/usr/bin/env bash
# The check set of que's own code. `just check` and the pipeline both run this file,
# and neither holds a check of its own, so green means the same in both places.
#
#   scripts/check.sh           the sets that read a file the change touched
#   scripts/check.sh server    the server set, whatever changed
#   scripts/check.sh ui        the UI set, whatever changed
#   scripts/check.sh shell     the shell set, whatever changed
#   scripts/check.sh --plan    print which sets the change needs, and run none
#
# Runs where Node is: in the dev container, or in a pipeline job. The shell set fetches its own tools.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD

# The change is measured from here. The pipeline names its own base,
# because there the base is the first parent of the commit it checks out.
base=${CHECK_BASE:-origin/main}

# The files the change touched: each commit since it left the base, and what is not committed yet.
# A renamed file counts at both of its paths.
changed() {
  local from
  from=$(git merge-base "$base" HEAD 2>/dev/null) || return 1
  git diff --name-only --no-renames "$from" && git ls-files --others --exclude-standard
}

# Which sets read the change. A path that no rule names can affect either app, so it counts for both.
plan() {
  need_server=false
  need_ui=false
  need_shell=false
  local paths path
  if ! paths=$(changed); then
    echo "Cannot tell what changed against $base: every set runs." >&2
    need_server=true
    need_ui=true
    need_shell=true
    return
  fi
  while read -r path; do
    case "$path" in
      "") ;;
      # The shell set runs it, and the server set lints and formats it.
      server/scripts/recipe-shell.mjs) need_server=true need_shell=true ;;
      server/*) need_server=true ;;
      ui/*) need_ui=true ;;
      # The check set itself, and the pipeline that calls it.
      scripts/check.sh | .github/*) need_server=true need_ui=true need_shell=true ;;
      # The shell set reads the scripts and the justfile. No app set reads them: every app step runs inside server/ or ui/.
      scripts/* | justfile) need_shell=true ;;
      # No set reads these.
      templates/* | .devcontainer/* | .githooks/* | tests/e2e/*) ;;
      */*) need_server=true need_ui=true ;;
      # The README names what que supplies, and a server test holds it to the list.
      README.md) need_server=true ;;
      *.md | LICENSE | .gitignore) ;;
      *) need_server=true need_ui=true ;;
    esac
  done <<<"$paths"
}

# Packages, from the lockfile and frozen. A copy of package.json and of the lockfile inside node_modules
# says what they came from, so a stale install is made again and a current one is left alone.
# npm's own record of the tree is written on every install: one newer than the copy means an install by hand.
# `step` runs this on the left of `||`, where `set -e` does not act: each command that can fail returns by itself.
install() {
  local stamp=node_modules/.installed-from
  if cat package.json package-lock.json | cmp -s - "$stamp" && [ ! node_modules/.package-lock.json -nt "$stamp" ]; then
    echo "node_modules matches package.json and the lockfile"
    return
  fi
  npm ci || return 1
  cat package.json package-lock.json >"$stamp" || return 1
}

# One step, named in the output, so a failure reads the same on a machine and in the pipeline.
step() {
  local name=$1 dir=$2
  shift 2
  echo "== $name"
  (cd "$root/$dir" && "$@") || {
    echo "check failed at: $name" >&2
    exit 1
  }
}

# A pipeline log is read after the run, so it names each test. A terminal gets one dot per test.
reporter="dot"
vitest_reporter="dot"
if [ -n "${CI:-}" ]; then
  reporter=spec
  vitest_reporter=verbose
fi

check_server() {
  step "server: install" server install
  step "server: types" server/harness npx tsc --noEmit
  step "server: lint" server npx eslint
  step "server: format" server npx prettier --check .
  step "server: unit and integration tests" server npx tsx --test --test-reporter="$reporter" \
    "plugin/**/*.test.ts" "core/**/*.test.ts" "ontology/**/*.test.ts" "backend/**/*.test.ts" "models/**/*.test.ts" "harness/src/**/*.test.ts" "evals/**/*.test.ts" "tests/integration/**/*.test.ts"
}

# The browser tests have a budget. A browser test needs the whole app up, and one
# marked @live sends a message to a real model, which is paid for and leaves a trace.
# The count goes down when a test is replaced by a smaller one. It goes up on the owner's word.
browser_budget() {
  local all=30 live=14 have sending
  have=$(cat tests/e2e/*.spec.ts | grep -cE '^[[:space:]]*test\(')
  sending=$(cat tests/e2e/*.spec.ts | grep -E -A1 '^[[:space:]]*test\(' | grep -c '@live')
  if [ "$have" -gt "$all" ] || [ "$sending" -gt "$live" ]; then
    echo "ui/tests/e2e has $have browser tests ($sending marked @live). The budget is $all ($live marked @live)."
    echo "A browser test is for what only the whole running app can show."
    echo "Put the decision in a function beside its component, and test that with Vitest."
    echo "Or replace a browser test that is there. Do not raise the budget: that is the owner's call."
    return 1
  fi
}

check_ui() {
  step "ui: install" ui install
  step "ui: types" ui npx tsc --noEmit
  step "ui: lint" ui npx eslint
  step "ui: format" ui npx prettier --check .
  step "ui: unit tests" ui npx vitest run --reporter="$vitest_reporter"
  step "ui: browser test budget" ui browser_budget
}

# The shell set's tools, each pinned to a release and held to its checksum, kept in the user's cache
# (in the dev container, the checkout's cache volume, kept across rebuilds).
tools=${XDG_CACHE_HOME:-$HOME/.cache}/que-tools
shellcheck=$tools/shellcheck-v0.11.0/shellcheck
just=$tools/just-1.56.0/just

# One tool, unless it is there already: its release, unpacked into a folder of its own and moved in whole,
# so a run beside this one sees all of it or none. `step` runs this on the left of `||`, as it does install.
fetch() {
  local bin=$1 url=$2 sum=$3 strip=$4 dir tmp failed
  [ ! -x "$bin" ] || return 0
  dir=$(dirname "$bin")
  mkdir -p "$tools" || return 1
  tmp=$(mktemp -d "$tools/.fetch.XXXXXX") || return 1
  # The folder goes, whether the tool came or not. A run beside this one may have moved its copy in first.
  curl -fsSL -o "$tmp/release.tar.gz" "$url" &&
    echo "$sum  $tmp/release.tar.gz" | sha256sum -c --quiet &&
    mkdir "$tmp/tool" &&
    tar -xzf "$tmp/release.tar.gz" -C "$tmp/tool" --strip-components="$strip" &&
    { mv -T "$tmp/tool" "$dir" 2>/dev/null || [ -x "$bin" ]; } || failed=1
  rm -rf "$tmp"
  return "${failed:-0}"
}

shell_tools() {
  local arch
  arch=$(uname -m) || return 1
  if [ "$arch" != x86_64 ]; then
    echo "The shell set's tools are pinned for x86_64 only, and this is $arch."
    return 1
  fi
  fetch "$shellcheck" https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.x86_64.tar.gz \
    b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6 1 || return 1
  fetch "$just" https://github.com/casey/just/releases/download/1.56.0/just-1.56.0-x86_64-unknown-linux-musl.tar.gz \
    fa2a8ec1015d9df5330941ade12437488fc40d33f9c9f8cd4eb70a26de11b639 0 || return 1
  "$shellcheck" --version | grep '^version' && "$just" --version
}

# The recipes of a justfile, as just dumps them, each written to a file of its own in the folder given.
recipes() {
  mkdir -p "$2" && "$just" --justfile "$1" --dump --dump-format json | node server/scripts/recipe-shell.mjs "$2"
}

# The shell of each script here and of each justfile recipe, with shellcheck's optional check of a masked return on:
# under `set -e`, a failure inside `$(...)` in a command's arguments, or inside `< <(...)`, does not stop the script.
# A recipe is named in the output as justfile/<recipe>, and its line counts from the recipe's first line.
# The lint is first held to scripts/masked-return.just, whose every recipe has a masked return:
# a lint that passes one of them reads nothing of the recipes, as it would if a new just dumped them in another shape.
lint() {
  local out=$1 failed=0 recipe hits
  recipes scripts/masked-return.just "$out/masked-return.just" || return 1
  for recipe in "$out"/masked-return.just/*; do
    hits=$("$shellcheck" --enable=check-extra-masked-returns --include=SC2312 --format=gcc "$recipe" || true)
    case "$hits" in
      *SC2312*) ;;
      *)
        echo "The lint finds no masked return in $recipe, from scripts/masked-return.just, which has one: it does not read the recipes."
        failed=1
        ;;
    esac
  done
  recipes justfile "$out/justfile" || return 1
  "$shellcheck" --enable=check-extra-masked-returns scripts/*.sh || failed=1
  (cd "$out" && "$shellcheck" --enable=check-extra-masked-returns justfile/*) || failed=1
  return "$failed"
}

# The lint, in a folder that goes when it is done, whether it passed or not.
shell_lint() {
  local out failed=0
  out=$(mktemp -d) || return 1
  lint "$out" || failed=1
  rm -rf "$out"
  return "$failed"
}

check_shell() {
  step "shell: tools" . shell_tools
  step "shell: lint" . shell_lint
}

case "${1:-}" in
  server) need_server=true need_ui=false need_shell=false ;;
  ui) need_server=false need_ui=true need_shell=false ;;
  shell) need_server=false need_ui=false need_shell=true ;;
  "" | --plan) plan ;;
  *)
    echo "usage: scripts/check.sh [server|ui|shell|--plan]" >&2
    exit 2
    ;;
esac

if [ "${1:-}" = --plan ]; then
  echo "server=$need_server"
  echo "ui=$need_ui"
  echo "shell=$need_shell"
  exit 0
fi

if ! $need_server && ! $need_ui && ! $need_shell; then
  echo "The change touches no file that a set reads: no set runs."
  exit 0
fi

# A set that was left out is named, with the reason: the change, or the argument.
why="the change touches no file it reads"
[ -z "${1:-}" ] || why="only the $1 set was asked for"
if $need_server; then check_server; else echo "== server: not run, $why"; fi
if $need_ui; then check_ui; else echo "== ui: not run, $why"; fi
if $need_shell; then check_shell; else echo "== shell: not run, $why"; fi
echo "check passed"
