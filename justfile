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
        # The server takes its settings from the deployment's .env, and none from que's own folder.
        podman exec -d -u node -e "QUE_DEPLOYMENT=$dep" -e "DOTENV_CONFIG_PATH=$dep/.env" -e "DOTENV_CONFIG_QUIET=true" -e "NODE_OPTIONS=--require dotenv/config" -w "{{root}}/server" "$c" bash -c 'npm run server > /tmp/server.log 2>&1' >/dev/null
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

# Typecheck, lint, check the format, and run the unit and integration tests of que's own code, for the server then the UI
check:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    c=$(./scripts/container.sh)
    at() { local where=$1; shift; podman exec -u node -w "{{root}}/$where" "$c" "$@"; }
    at server/harness npx tsc --noEmit
    at server npx eslint
    at server npx prettier --check .
    at server npx tsx --test --test-reporter=dot "contract/**/*.test.ts" "backend/**/*.test.ts" "harness/src/**/*.test.ts" "tests/integration/**/*.test.ts"
    at ui npx tsc --noEmit
    at ui npx eslint
    at ui npx prettier --check .
    echo "check passed"

# Format every file in both apps with Prettier
format:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    c=$(./scripts/container.sh)
    podman exec -u node -w "{{root}}/server" "$c" npx prettier --write .
    podman exec -u node -w "{{root}}/ui" "$c" npx prettier --write .

# Run the end to end tests in a browser (needs a deployment started; some need its services connected)
test: _require-up
    podman exec -u node -w "{{root}}/ui" "$(just _container)" npx playwright test

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
