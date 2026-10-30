#!/usr/bin/env bash
# Checks, against the real Langfuse, that que's server sends the trace of a run.
# Run on the host, with que started for the deployment given (`just start` in it), and
# the three Langfuse settings in its .env. It makes one model call, and the
# trace it leaves in Langfuse holds what the agent read.
#
#   tests/e2e/trace.sh <deployment folder>
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
dep=$(cd "${1:?usage: trace.sh <deployment folder>}" && pwd)
que=${QUE_URL:-http://localhost:2024}
failed=0

ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; failed=$((failed + 1)); }
stop() { echo "FAIL  $1" >&2; exit 1; }

[ -f "$dep/.env" ] || stop "no .env in $dep"
# A setting of the deployment's .env. It is read as dotenv reads it, and never printed.
setting() { sed -n "s/^$1=//p" "$dep/.env" | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
LANGFUSE_BASE_URL=$(setting LANGFUSE_BASE_URL)
LANGFUSE_PUBLIC_KEY=$(setting LANGFUSE_PUBLIC_KEY)
LANGFUSE_SECRET_KEY=$(setting LANGFUSE_SECRET_KEY)
for name in LANGFUSE_BASE_URL LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY; do
  [ -n "${!name}" ] || stop "$name is not set in $dep/.env"
done
langfuse() { curl -sS --max-time 20 -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" "$LANGFUSE_BASE_URL$1"; }
post() { curl -sS --max-time 180 -H 'content-type: application/json' -d "$2" "$que$1"; }

curl -sS -o /dev/null --max-time 5 "$que/ok" || stop "que is not up at $que"

# One run on a new thread, as a user makes one: POST /threads, then a run of
# AG-UI's RunAgentInput on POST /threads/:id/runs, whose answer streams back as
# AG-UI events over SSE. The message asks for one tool call that reads no
# record of a service.
thread=$(post /threads '{}' | jq -r .id)
[ -n "$thread" ] && [ "$thread" != null ] || stop "que made no thread"
# The thread is kept: que's server deletes no thread before F3.
input=$(jq -nc --arg thread "$thread" --arg run "$(cat /proc/sys/kernel/random/uuid)" --arg id "$(cat /proc/sys/kernel/random/uuid)" \
  '{threadId: $thread, runId: $run, messages: [{id: $id, role: "user", content: "Open one of your packages, and tell me its title. Read nothing else."}], tools: [], context: [], state: {}, forwardedProps: {}}')
# The type of each event of the run's stream, one per line.
events=$(post "/threads/$thread/runs" "$input" | sed -n 's/^data: *//p' | jq -r '.type? // empty' 2>/dev/null || true)
if grep -qx RUN_FINISHED <<<"$events" && grep -qx TEXT_MESSAGE_CONTENT <<<"$events"; then
  ok "the run ended with an answer"
else
  stop "the run did not end with an answer: $(paste -sd ' ' <<<"$events" | cut -c1-200)"
fi

# The SDK sends on a timer, and Langfuse takes the trace in after that. The
# thread is on the first step of a trace only, so it finds the trace, and the
# trace's id then gives each step.
steps="/api/public/v2/observations?limit=100&fields=core,basic,metadata,io"
first=""
for _ in $(seq 1 24); do
  first=$(langfuse "$steps&sessionId=$thread" | jq -c '.data[0] // empty' 2>/dev/null || true)
  [ -n "$first" ] && break
  sleep 5
done
[ -n "$first" ] || stop "Langfuse has no trace of thread $thread after 120 seconds"
ok "Langfuse holds a trace of the thread"
id=$(jq -r .traceId <<<"$first")

has() { # what, value
  if [ -n "$2" ]; then ok "the trace has $1: $2"; else bad "the trace has no $1"; fi
}
has "a user id" "$(jq -r '.userId // empty' <<<"$first")"
has "an agent config" "$(jq -r '.metadata.agent // empty' <<<"$first")"
# The commit que runs from is sent as the release. Langfuse 4 gives no release
# over this API: it is read in the Langfuse UI, on the trace.

full=$(langfuse "$steps&traceId=$id")
count() { jq --arg type "$1" '[.data[]? | select(.type == $type)] | length' <<<"$full"; }
[ "$(count GENERATION)" -ge 1 ] && ok "the trace holds $(count GENERATION) model calls" || bad "the trace holds no model call"
[ "$(count TOOL)" -ge 1 ] && ok "the trace holds $(count TOOL) tool calls" || bad "the trace holds no tool call"

# No secret of the deployment is in the trace: each value of its .env that is a key, a password or a secret.
leaked=0
while IFS= read -r name; do
  value=$(setting "$name")
  [ "${#value}" -ge 8 ] || continue
  if grep -qF -- "$value" <<<"$full"; then bad "the trace holds the value of $name"; leaked=1; fi
done < <(grep -oE '^[A-Z_]*(KEY|PASSWORD|SECRET|TOKEN)[A-Z_]*' "$dep/.env" | sort -u)
[ "$leaked" = 0 ] && ok "the trace holds no secret of the deployment's .env"

echo
if [ "$failed" = 0 ]; then echo "all passed"; else echo "$failed failed"; fi
echo "$LANGFUSE_BASE_URL/project/$(jq -r .projectId <<<"$first")/traces/$id"
[ "$failed" = 0 ]
