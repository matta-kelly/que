#!/usr/bin/env bash
# B5: the harness runs on pi's storage in Postgres, and one process owns a
# deployment. Run from que's root, with a disposable Postgres and port 2025
# free:
#
#   DATABASE_URL=postgres://que:<password>@127.0.0.1:5433/que_b5_test tests/e2e/one-owner.sh
#
# DATABASE_URL names a database on a disposable Postgres server. The script
# makes a database of its own on that server (que_b5_e2e_<pid>, "postgres" is
# used for that), and drops it on exit. It starts que's server from the branch
# (`npm run serve`, the listen path) on port 2025, so that port must be free.
# The deployment is templates/deployment in a temp folder, with que's packages
# linked in. It has no model key, so a run's model call fails and the run ends
# with RUN_ERROR; the user's message is written first, and it is the chat this
# checks.
#
# It checks:
#   1. a database whose threads table S1 made (no conversation column) gets the
#      column at start, and the checks below run on that database
#   2. a chat is whole after a restart on a fresh process, its ids included,
#      and a resend after the restart makes no second run
#   3. a thread made before B5 (a row with no conversation) has no messages at
#      the restart, and its next run starts it a conversation
#   4. a second server stops at start and says that another process owns the
#      deployment, while the first still serves
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
url=${DATABASE_URL:?usage: DATABASE_URL=postgres://... tests/e2e/one-owner.sh}
port=2025
que=http://127.0.0.1:$port
name=que_b5_e2e_$$
tmp=$(mktemp -d)
pids=()

ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; failed=$((failed + 1)); }
stop() {
  echo "FAIL  $1" >&2
  exit 1
}
failed=0

# --- a disposable database, and a helper that runs one query on it -------------

ln -s "$root/server/node_modules" "$tmp/node_modules"
cat >"$tmp/db.mjs" <<'JS'
import pg from "pg";
const url = new URL(process.env.DATABASE_URL);
if (process.env.ADMIN) url.pathname = "/postgres";
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  const { rows } = await client.query(process.env.SQL);
  for (const row of rows) console.log(Object.values(row).join("\t"));
} finally {
  await client.end();
}
JS
dburl=$(DB="$name" DATABASE_URL="$url" node -e 'const u = new URL(process.env.DATABASE_URL); u.pathname = "/" + process.env.DB; console.log(u.toString())')
sql() { DATABASE_URL="$dburl" SQL="$1" node "$tmp/db.mjs"; }
admin() { DATABASE_URL="$dburl" ADMIN=1 SQL="$1" node "$tmp/db.mjs"; }

deployment="$tmp/deployment"
cp -r "$root/templates/deployment" "$deployment"
mkdir -p "$deployment/node_modules"
ln -s "$root/server/node_modules/@mku1tra" "$deployment/node_modules/@mku1tra"
echo '{ "type": "module" }' >"$deployment/package.json"

cleanup() {
  for p in "${pids[@]}"; do kill -TERM -- "-$p" 2>/dev/null || true; done
  sleep 0.5
  admin "DROP DATABASE IF EXISTS $name WITH (FORCE)" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

# --- real server processes -----------------------------------------------------

alive() { # pid
  local state
  state=$(ps -o stat= -p "$1" 2>/dev/null || true)
  [ -n "$state" ] && [ "${state:0:1}" != Z ]
}

start() { # log [prefix...] -> $pid, the process group of one `npm run serve`
  local log=$1
  shift
  set -m
  ( cd "$root/server/runtime" && exec env \
    QUE_DEPLOYMENT="$deployment" \
    DATABASE_URL="$dburl" \
    DEV_USER_EMAIL=b5@example.com \
    QUE_CREDENTIALS_KEY="$(head -c32 /dev/urandom | base64)" \
    "$@" npm run serve ) >"$log" 2>&1 &
  pid=$!
  set +m
  pids+=("$pid")
}

up() { # pid log: the server answers /ok, or this process is gone
  for _ in $(seq 1 120); do
    curl -sf -m 1 -o /dev/null "$que/ok" && return 0
    alive "$1" || return 1
    sleep 0.5
  done
  return 1
}

free_port() {
  for _ in $(seq 1 100); do
    curl -sf -m 1 -o /dev/null "$que/ok" || return 0
    sleep 0.2
  done
  return 1
}

send() { # thread, runId, messages as JSON
  curl -sS -m 120 -X POST -H "content-type: application/json" \
    -d "$(jq -n --arg t "$1" --arg r "$2" --argjson m "$3" \
      '{threadId: $t, runId: $r, messages: $m, tools: []}')" \
    "$que/threads/$1/runs" || stop "que did not answer the run $2 on thread $1"
}
types() { sed -n 's/^data: //p' | jq -r .type; }
get() { curl -sS -m 10 "$que$1" || stop "que did not answer GET $1"; }
messagesOf() { get "/threads/$1" | jq -c '[.messages[] | {id, role, content}]'; }

# --- 1. the threads table S1 made, and the ALTER ------------------------------

admin "CREATE DATABASE $name"
sql "CREATE TABLE threads (
  id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owner      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)"
ok "the database has the threads table S1 made, with no conversation column"

start "$tmp/server-1.log"
pid1=$pid
up "$pid1" || stop "the first server did not come up: $(cut -c1-400 "$tmp/server-1.log" | tr '\n' ' ')"
column=""
for _ in $(seq 1 40); do
  column=$(sql "SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'threads' AND column_name = 'conversation'")
  [ -n "$column" ] && break
  sleep 0.25
done
if [ "$column" = "$(printf 'conversation\ttext')" ]; then
  ok "the ALTER added the conversation column to S1's threads table"
else
  bad "the threads table S1 made has no conversation text column after the server started: got '${column:-none}', so the ALTER TABLE did not run"
fi

# --- a chat on a new thread, then a fresh process on the same database ---------

made=$(curl -sS -m 10 -X POST "$que/threads") || stop "que did not make a thread"
thread=$(jq -r .id <<<"$made")
[ -n "$thread" ] && [ "$thread" != null ] || stop "que made no thread: $made"

first=$(send "$thread" run-1 '[{"id":"m1","role":"user","content":"hello"}]')
grep -q '"type":"RUN_STARTED"' <<<"$first" || stop "the first run did not start: $(cut -c1-400 <<<"$first" | tr '\n' ' ')"
second=$(send "$thread" run-2 '[{"id":"m1","role":"user","content":"hello"},{"id":"m2","role":"user","content":"again"}]')
grep -q '"type":"RUN_STARTED"' <<<"$second" || stop "the second run did not start: $(cut -c1-400 <<<"$second" | tr '\n' ' ')"
want='[{"id":"m1","role":"user","content":"hello"},{"id":"m2","role":"user","content":"again"}]'
got=$(messagesOf "$thread")
[ "$got" = "$want" ] || stop "the chat before the restart is not both of the user's messages: got $got"

owner=$(get /que/me | jq -r .id)
[ -n "$owner" ] && [ "$owner" != null ] || stop "no signed-in user: $(get /que/me)"
sql "INSERT INTO threads (id, owner) VALUES ('b5-before-b5', '$owner')"
ok "the database has a thread made before B5: a row with no conversation"

kill -TERM -- "-$pid1" 2>/dev/null || true
free_port || stop "the first server did not let go of port $port"

start "$tmp/server-2.log"
pid2=$pid
up "$pid2" || stop "the server did not come back up: $(cut -c1-400 "$tmp/server-2.log" | tr '\n' ' ')"

got=$(messagesOf "$thread")
if [ "$got" = "$want" ]; then
  ok "the chat is whole after the restart on a fresh process, its ids included"
else
  bad "the chat after the restart is not whole: expected $want, got $got, so the conversation is not kept in the thread's row"
fi

resend=$(send "$thread" run-2 '[{"id":"m1","role":"user","content":"hello"},{"id":"m2","role":"user","content":"again"}]')
resendTypes=$(types <<<"$resend" | paste -sd, -)
if [ "$resendTypes" = "RUN_STARTED,RUN_FINISHED" ]; then
  ok "the resend after the restart made no second run: only RUN_STARTED and RUN_FINISHED"
else
  bad "the resend after the restart made a run: expected only RUN_STARTED and RUN_FINISHED, got ${resendTypes:-no events}"
fi
after=$(messagesOf "$thread")
[ "$after" = "$want" ] || bad "the resend changed the chat: expected $want, got $after"

# --- 3. the thread made before B5 ---------------------------------------------

s1=$(messagesOf b5-before-b5)
if [ "$s1" = "[]" ]; then
  ok "a thread made before B5 has no messages at the restart"
else
  bad "a thread made before B5 should have no messages at the restart: got $s1"
fi
send b5-before-b5 s1-run '[{"id":"s1-m1","role":"user","content":"hello again"}]' >/dev/null
s1=$(messagesOf b5-before-b5)
if [ "$s1" = '[{"id":"s1-m1","role":"user","content":"hello again"}]' ]; then
  ok "a thread made before B5 runs, on a conversation it did not have"
else
  bad "a thread made before B5 is not usable: its run's message is not in it: got $s1"
fi
s1conversation=$(sql "SELECT conversation FROM threads WHERE id = 'b5-before-b5'" 2>/dev/null) || s1conversation=""
if [ -n "$s1conversation" ]; then
  ok "its next run wrote the conversation it started to its row"
else
  bad "a thread made before B5 did not get a conversation in its row on its next run"
fi

# --- 4. one owner -------------------------------------------------------------

start "$tmp/server-3.log" timeout 60
pid3=$pid
status=0
wait "$pid3" || status=$?
if [ "$status" -eq 0 ]; then
  bad "a second server started on a deployment another server owns, and did not stop at start"
elif [ "$status" -eq 124 ]; then
  bad "a second server did not stop at start: it ran on after 60 seconds"
else
  said=$(tr '\n' ' ' <"$tmp/server-3.log")
  if grep -Eqi 'another' <<<"$said" &&
    grep -Eqi 'owns|owner|in use|already|holding|lock' <<<"$said"; then
    ok "a second server stopped at start, and said another process owns the deployment"
  else
    bad "a second server stopped, but did not say another process owns the deployment: $(cut -c1-400 <<<"$said")"
  fi
fi
curl -sf -m 2 -o /dev/null "$que/ok" && ok "the first server still serves" || bad "the first server stopped serving while the second tried to start"

echo
if [ "$failed" = 0 ]; then echo "all passed"; else echo "$failed failed"; fi
[ "$failed" = 0 ]
