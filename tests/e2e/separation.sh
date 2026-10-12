#!/usr/bin/env bash
# Checks the spec in _well/harness-ui-refactor.md. Run from the repo root, on the
# host, on the spec's branch, with `just up` running and Odoo connected.
set -euo pipefail

repo=matta-kelly/que
workflow=.github/workflows/checks.yml
branch=$(git branch --show-current)

fail() { echo "FAIL: $1" >&2; exit 1; }
pass() { echo "ok: $1"; }

for part in agent platform packages package.json package-lock.json; do
  [ -e "harness/$part" ] || fail "no harness/$part"
done
python3 - <<'PY' || fail "harness/package.json still lists the UI as a workspace"
import json
assert not any("ui" in w for w in json.load(open("harness/package.json"))["workspaces"])
PY
pass "harness/ holds the agent, platform and packages, with its own package.json and lockfile"

[ -f ui/package.json ] && [ -f ui/package-lock.json ] || fail "ui/ has no package.json or lockfile of its own"
[ ! -e package.json ] && [ ! -e package-lock.json ] || fail "the repo root still has a package.json or a lockfile"
pass "ui/ has its own package.json and lockfile, and the root has neither"

# A relative import that climbs out of ui/ needs more "../" than the file is deep.
python3 - <<'PY' || fail "a file in ui/ imports from outside ui/"
import pathlib, re, subprocess
files = subprocess.run(["git", "ls-files", "ui/*.ts", "ui/*.tsx"], capture_output=True, text=True, check=True).stdout.split()
for f in files:
    depth = len(pathlib.PurePosixPath(f).parts) - 2
    for spec in re.findall(r"""from\s+["']([^"']+)["']""", pathlib.Path(f).read_text()):
        assert not spec.startswith("@que/"), (f, spec)
        assert spec.count("../") <= depth, (f, spec)
PY
! git grep -nE '\.\./ui/|"ui"|-w @que/ui' -- harness ':!harness/package-lock.json' >/dev/null \
  || fail "code in harness/ refers to the UI's folder"
pass "nothing in ui/ imports from outside it, and nothing in harness/ refers to it"

python3 - <<'PY' || fail "ui/ and harness/ are not both on TypeScript 6"
import json
lock = lambda p: json.load(open(p))["packages"]["node_modules/typescript"]["version"]
assert lock("ui/package-lock.json").startswith("6."), lock("ui/package-lock.json")
assert lock("harness/package-lock.json").startswith("6."), lock("harness/package-lock.json")
PY
pass "the UI is on TypeScript 6, the same major version as the harness"

python3 - "$workflow" <<'PY' || fail "the harness and ui jobs do not each check out only their own folder"
import sys, yaml
jobs = yaml.safe_load(open(sys.argv[1]))["jobs"]
for name in ("harness", "ui"):
    sparse = [s["with"]["sparse-checkout"].split() for s in jobs[name]["steps"] if "sparse-checkout" in s.get("with", {})]
    assert sparse == [[name]], (name, sparse)
PY
pass "each app installs and passes its checks with the other folder absent"

python3 - "$workflow" <<'PY' || fail "the harness and ui jobs are not each limited to their own paths"
import sys, yaml
jobs = yaml.safe_load(open(sys.argv[1]))["jobs"]
assert "changes" in jobs
for name in ("harness", "ui"):
    assert "changes" in jobs[name]["needs"], name
    assert f"needs.changes.outputs.{name}" in jobs[name]["if"], name
assert all(0 < job.get("timeout-minutes", 0) <= 10 for job in jobs.values())
PY
pass "a change to one app runs that app's checks only"

python3 - "$workflow" <<'PY' || fail "the checks job does not always run after changes, harness and ui"
import sys, yaml
gate = yaml.safe_load(open(sys.argv[1]))["jobs"]["checks"]
assert set(gate["needs"]) == {"changes", "harness", "ui"}
assert "always()" in gate["if"]
PY
timeout 60 gh api "repos/$repo/rules/branches/main" \
  --jq '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context' \
  | grep -qx checks || fail "the ruleset on main does not require checks"
pass "checks still gates main, and passes when one side is skipped"

# A run that never finishes must fail here, not hang.
timeout -k 5 600 gh pr checks "$branch" --repo "$repo" --watch --fail-fast >/dev/null \
  || fail "the run on this pull request did not pass within 600s"
gh pr checks "$branch" --repo "$repo" --json name,state \
  --jq '.[] | select(.name == "checks") | .state' | grep -qx SUCCESS \
  || fail "no passing run named checks on this pull request"
pass "checks passes on this pull request"

timeout -k 5 600 just check >/dev/null || fail "just check did not pass within 600s"
timeout -k 5 600 just test >/dev/null || fail "the end to end tests did not pass within 600s"
pass "just check and the end to end tests pass"
