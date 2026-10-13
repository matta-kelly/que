# que commands. The database runs in its own container (que-postgres);
# everything else runs in the dev container. A deployment's scripts call these
# with `just --justfile`; the ones that work on que's own code run from anywhere in the repo.

root := justfile_directory()

# List the commands
default:
    @just --list

# Start the database, the dev container, the agent server and the UI, from one deployment folder.
# Nothing in que picks the deployment: a deployment starts que this way from its own `start` script.
up deployment:
    #!/usr/bin/env bash
    set -euo pipefail
    dep=$(cd "{{invocation_directory()}}" && cd "{{deployment}}" && pwd)
    [ -f "$dep/.env" ] || { echo "No .env in $dep. A deployment keeps its settings and secrets there: see templates/deployment/.env.example"; exit 1; }
    cd "{{root}}"
    ./scripts/db.sh "$dep/.env"
    c=$(./scripts/container.sh "$dep")
    running() { podman exec "$c" pgrep -f "$1" >/dev/null; }
    if running "langgraphjs dev"; then
        echo "The agent server is already running. Run 'just down' first to start it from another deployment."
    else
        # The commit que runs from, for the trace of a run. Code that is not committed does not carry the name of a commit.
        commit=$(git -C "{{root}}" rev-parse HEAD 2>/dev/null || true)
        if [ -n "$commit" ] && ! git -C "{{root}}" diff --quiet HEAD; then commit="$commit-dirty"; fi
        # The server takes its settings from the deployment's .env, and none from que's own folder.
        podman exec -d -u node -e "QUE_DEPLOYMENT=$dep" -e "QUE_COMMIT=$commit" -e "DOTENV_CONFIG_PATH=$dep/.env" -e "DOTENV_CONFIG_QUIET=true" -e "NODE_OPTIONS=--require dotenv/config" -w "{{root}}/server" "$c" bash -c 'npm run server > /tmp/server.log 2>&1' >/dev/null
    fi
    running "next dev" || podman exec -d -u node -w "{{root}}/ui" "$c" bash -c 'npm run dev > /tmp/ui.log 2>&1' >/dev/null
    echo "Starting…"
    for _ in $(seq 1 60); do
        curl -s -m 2 localhost:2024/ok >/dev/null && curl -s -m 30 -o /dev/null localhost:3000 && break
        sleep 2
    done
    curl -s -m 2 -o /dev/null localhost:3000 || { echo "The UI didn't come up. See the deployment's logs"; exit 1; }
    echo "que is up at http://localhost:3000"

# Stop everything (the dev container, which stops the server and UI, and the database)
down:
    #!/usr/bin/env bash
    set -euo pipefail
    c=$(just _container)
    [ -n "$c" ] && podman stop "$c" >/dev/null
    podman stop que-postgres >/dev/null 2>&1 || true
    echo "que is down"

# Follow the agent server and UI logs
logs: _require-up
    podman exec "$(just _container)" tail -n 50 -f /tmp/server.log /tmp/ui.log

# Run the cases of a deployment's packages against que, under each of its agent configs, and print what the agent did.
# With the Langfuse settings in the deployment's .env, the runs are also sent to its Langfuse, and a link to each is printed.
# que has to be up for that deployment. `--agent <name>`, one or more times, runs only those configs.
eval deployment *args: _require-up
    #!/usr/bin/env bash
    set -euo pipefail
    dep=$(cd "{{invocation_directory()}}" && cd "{{deployment}}" && pwd)
    cd "{{root}}"
    c=$(./scripts/container.sh "$dep")
    # The commit of que, for the name of a run in Langfuse. Code that is not committed does not carry the name of a commit.
    commit=$(git -C "{{root}}" rev-parse --short HEAD)
    if [ -n "$(git -C "{{root}}" status --porcelain --untracked-files=no)" ]; then commit="$commit-dirty"; fi
    # The deployment imports the contract by name, and has no copy of its own: it is handed que's, as mount hands it.
    # The runner takes its settings from the deployment's .env, as the server does.
    podman exec -u node -e "QUE_COMMIT=$commit" -w "{{root}}/server/evals" "$c" npx tsx --env-file="$dep/.env" --import "{{root}}/server/harness/src/mount/supply.ts" src/cli.ts "$dep" {{args}}

# Type check a deployment's own code and run its tests, with que's contract handed to both
check-deployment deployment:
    #!/usr/bin/env bash
    set -euo pipefail
    dep=$(cd "{{invocation_directory()}}" && cd "{{deployment}}" && pwd)
    cd "{{root}}"
    c=$(./scripts/container.sh "$dep")
    h="{{root}}/server"
    # The deployment has no install of its own: the compiler is told where que keeps what it imports.
    podman exec -i -u node "$c" sh -c 'mkdir -p /tmp/que-check && cat > /tmp/que-check/tsconfig.json' <<EOF
    {
      "extends": "$h/harness/tsconfig.json",
      "compilerOptions": {
        "rootDir": "/",
        "typeRoots": ["$h/node_modules/@types"],
        "paths": { "@que/core": ["$h/contract/index.ts"], "zod": ["$h/node_modules/zod"] }
      },
      "include": ["$dep/**/*.ts"],
      "exclude": ["$dep/**/node_modules"]
    }
    EOF
    podman exec -u node -w "$h" "$c" npx tsc --noEmit -p /tmp/que-check/tsconfig.json
    podman exec -u node -w "$dep" "$c" "$h/node_modules/.bin/tsx" --import "$h/harness/src/mount/supply.ts" --test "**/*.test.ts"
    echo "check passed"

# Check que's own code: the sets of the apps the change touched. `just check server` or `just check ui` runs one app's set, whatever changed
check *set:
    #!/usr/bin/env bash
    set -euo pipefail
    c=$("{{root}}/scripts/container.sh")
    podman exec -u node -w "{{root}}" "$c" scripts/check.sh {{set}}

# Format every file in both apps with Prettier
format:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    c=$(./scripts/container.sh)
    podman exec -u node -w "{{root}}/server" "$c" npx prettier --write .
    podman exec -u node -w "{{root}}/ui" "$c" npx prettier --write .

# Run the browser tests that are not marked @live, on the test deployment (server/tests/integration/browser).
# Its models are a local stand-in and it sends no trace, so a run calls no provider and no Langfuse.
# It starts what is down (the database, the stand-in, the agent server, the UI) and stops what it started.
test:
    #!/usr/bin/env bash
    set -euo pipefail
    dep="{{root}}/server/tests/integration/browser"
    cd "{{root}}"
    c=$(./scripts/container.sh)
    running() { podman exec "$c" pgrep -f "$1" >/dev/null; }
    if running "langgraphjs dev"; then
        # The deployment the agent server was started from. Only the user that runs it can read it.
        of=$(podman exec -u node "$c" sh -c 'tr "\0" "\n" < /proc/$(pgrep -of "[l]anggraphjs dev")/environ | sed -n "s/^QUE_DEPLOYMENT=//p"')
        [ "$of" = "$dep" ] || { echo "que is up for another deployment ($of), so no test ran. Stop it first: 'just down'"; exit 1; }
    fi
    # A thing that is down is started as a process group of its own, and that group is stopped at the end.
    started=()
    db_was_up=$(podman inspect -f '{{{{.State.Running}}' que-postgres 2>/dev/null || echo false)
    start() {
        local name=$1 dir=$2 command=$3
        shift 3
        podman exec -d -u node "$@" -w "$dir" "$c" bash -c "echo \$\$ > /tmp/test-$name.pid; $command > /tmp/$name.log 2>&1" >/dev/null
        started+=("$name")
    }
    stop() {
        for name in "${started[@]}"; do
            podman exec "$c" sh -c "kill -- -\$(cat /tmp/test-$name.pid)" || true
        done
        [ "$db_was_up" = true ] || podman stop que-postgres >/dev/null 2>&1 || true
    }
    trap stop EXIT
    ./scripts/db.sh "$dep/.env" >/dev/null
    # The database keeps the password it was made with, which can be another deployment's.
    password=$(podman inspect que-postgres -f '{{{{range .Config.Env}}{{{{println .}}{{{{end}}' | sed -n 's/^POSTGRES_PASSWORD=//p')
    running "browser/provider.ts" || start provider "{{root}}/server" "npx tsx --env-file=$dep/.env $dep/provider.ts"
    running "langgraphjs dev" || start server "{{root}}/server" "npm run server" \
        -e "QUE_DEPLOYMENT=$dep" -e "DATABASE_URL=postgres://que:$password@127.0.0.1:5433/que" \
        -e "DOTENV_CONFIG_PATH=$dep/.env" -e "DOTENV_CONFIG_QUIET=true" -e "NODE_OPTIONS=--require dotenv/config"
    running "next dev" || start ui "{{root}}/ui" "npm run dev"
    echo "Starting…"
    for _ in $(seq 1 60); do
        curl -s -m 2 localhost:2024/ok >/dev/null && curl -s -m 30 -o /dev/null localhost:3000 && break
        sleep 2
    done
    curl -s -m 2 -o /dev/null localhost:3000 || { echo "que didn't come up on the test deployment. See /tmp/server.log and /tmp/ui.log in the container"; exit 1; }
    running "browser/provider.ts" || { echo "The stand-in of the provider didn't come up. See /tmp/provider.log in the container"; exit 1; }
    # The package of the test deployment, connected for the dev user: its token is made up (packages/shelf).
    curl -sf -m 10 -o /dev/null -X PUT -H "content-type: application/json" -d '{"values":{"token":"shelf-test"}}' localhost:2024/que/connections/shelf \
        || { echo "The package of the test deployment did not connect. See /tmp/server.log in the container"; exit 1; }
    # Some tests need a chat in the list, and a new checkout has none.
    threads() { curl -sf -m 10 -X POST -H "content-type: application/json" -d "$2" "localhost:2024/threads$1"; }
    [ "$(threads /search '{"limit":1}')" != "[]" ] || threads "" "{}" >/dev/null
    status=0
    podman exec -u node -w "{{root}}/ui" "$c" npx playwright test --grep-invert @live || status=$?
    echo "The stand-in answered $(podman exec "$c" grep -c '^model request' /tmp/provider.log) model requests."
    exit $status

# Run the browser tests marked @live, against the que that is up: the real model and the real services of that deployment.
# Each message is a model call that is paid for, and a trace when the deployment has a Langfuse.
test-live: _require-up
    podman exec -u node -w "{{root}}/ui" "$(just _container)" npx playwright test --grep @live

# The dev container for this repo, found by its dev-container label
_container:
    @podman ps -a --filter "label=devcontainer.local_folder={{root}}" --format '{{{{.Names}}' | head -1

_require-container:
    #!/usr/bin/env bash
    c=$(just _container)
    [ -n "$c" ] && [ "$(podman inspect -f '{{{{.State.Running}}' "$c")" = "true" ] || { echo "The dev container isn't running. Start a deployment: <its folder>/start"; exit 1; }

_require-up: _require-container
    #!/usr/bin/env bash
    curl -s -m 3 -o /dev/null localhost:3000 || { echo "que isn't running. Start a deployment: <its folder>/start"; exit 1; }
