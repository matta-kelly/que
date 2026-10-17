#!/usr/bin/env bash
# The check set of que's own code. `just check` and the pipeline both run this file,
# and neither holds a check of its own, so green means the same in both places.
#
#   scripts/check.sh           the sets that read a file the change touched
#   scripts/check.sh server    the server set, whatever changed
#   scripts/check.sh ui        the UI set, whatever changed
#   scripts/check.sh --plan    print which sets the change needs, and run none
#
# Runs where Node is: in the dev container, or in a pipeline job.
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
  local paths path
  if ! paths=$(changed); then
    echo "Cannot tell what changed against $base: both sets run." >&2
    need_server=true
    need_ui=true
    return
  fi
  while read -r path; do
    case "$path" in
      "") ;;
      server/*) need_server=true ;;
      ui/*) need_ui=true ;;
      # The check set itself, and the pipeline that calls it.
      scripts/check.sh | .github/*) need_server=true need_ui=true ;;
      # No set reads these: every step runs inside server/ or ui/.
      scripts/* | templates/* | .devcontainer/* | tests/e2e/*) ;;
      */*) need_server=true need_ui=true ;;
      # The README names what que supplies, and a server test holds it to the list.
      README.md) need_server=true ;;
      *.md | LICENSE | justfile | .gitignore) ;;
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
reporter=dot
vitest_reporter=dot
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
    "core/**/*.test.ts" "backend/**/*.test.ts" "harness/src/**/*.test.ts" "evals/**/*.test.ts" "tests/integration/**/*.test.ts"
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

case "${1:-}" in
  server) need_server=true need_ui=false ;;
  ui) need_server=false need_ui=true ;;
  "" | --plan) plan ;;
  *)
    echo "usage: scripts/check.sh [server|ui|--plan]" >&2
    exit 2
    ;;
esac

if [ "${1:-}" = --plan ]; then
  echo "server=$need_server"
  echo "ui=$need_ui"
  exit 0
fi

if ! $need_server && ! $need_ui; then
  echo "The change touches no file that an app set reads: no set runs."
  exit 0
fi

# A set that was left out is named, with the reason: the change, or the argument.
why="the change touches no file it reads"
[ -z "${1:-}" ] || why="only the $1 set was asked for"
if $need_server; then check_server; else echo "== server: not run, $why"; fi
if $need_ui; then check_ui; else echo "== ui: not run, $why"; fi
echo "check passed"
