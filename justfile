# que dev commands. The database runs in its own container (que-postgres);
# everything else runs in the dev container. Run from anywhere in the repo.

root := justfile_directory()

# List the commands
default:
    @just --list

# Start the database, the dev container, the agent server and the UI
up:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    ./scripts/db.sh
    c=$(just _container)
    if [ -z "$c" ]; then
        # First run: build the dev container; its postCreateCommand installs packages.
        npx -y @devcontainers/cli@0.89.0 up --workspace-folder . --docker-path podman
        c=$(just _container)
    else
        podman start "$c" >/dev/null
    fi
    running() { podman exec "$c" pgrep -f "$1" >/dev/null; }
    running "langgraphjs dev" || podman exec -d -u node -w "{{root}}/harness" "$c" bash -c 'npm run server > /tmp/server.log 2>&1' >/dev/null
    running "next dev" || podman exec -d -u node -w "{{root}}/ui" "$c" bash -c 'npm run dev > /tmp/ui.log 2>&1' >/dev/null
    echo "Starting…"
    for _ in $(seq 1 60); do
        curl -s -m 2 localhost:2024/ok >/dev/null && curl -s -m 30 -o /dev/null localhost:3000 && break
        sleep 2
    done
    curl -s -m 2 -o /dev/null localhost:3000 || { echo "The UI didn't come up. See: just logs"; exit 1; }
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

# Typecheck, lint, check the format, and run the unit tests, for the harness then the UI; needs only the dev container running
check: _require-container
    podman exec -u node -w "{{root}}/harness/agent" "$(just _container)" npx tsc --noEmit
    podman exec -u node -w "{{root}}/harness/evals" "$(just _container)" npx tsc --noEmit
    podman exec -u node -w "{{root}}/harness" "$(just _container)" npx eslint
    podman exec -u node -w "{{root}}/harness" "$(just _container)" npx prettier --check .
    podman exec -u node -w "{{root}}/harness" "$(just _container)" npx tsx --test --test-reporter=dot "packages/**/*.test.ts" "platform/**/*.test.ts" "agent/src/**/*.test.ts"
    podman exec -u node -w "{{root}}/ui" "$(just _container)" npx tsc --noEmit
    podman exec -u node -w "{{root}}/ui" "$(just _container)" npx eslint
    podman exec -u node -w "{{root}}/ui" "$(just _container)" npx prettier --check .
    @echo "check passed"

# Format every file in both apps with Prettier
format: _require-container
    podman exec -u node -w "{{root}}/harness" "$(just _container)" npx prettier --write .
    podman exec -u node -w "{{root}}/ui" "$(just _container)" npx prettier --write .

# Run the end to end tests in a browser (needs `just up`, and Odoo connected for some)
test: _require-up
    podman exec -u node -w "{{root}}/ui" "$(just _container)" npx playwright test

# Run the evals against the agent, each case `runs` times (needs `just up` and Odoo connected)
eval runs="3": _require-up
    podman exec -u node -w "{{root}}/harness" "$(just _container)" npm run eval -- {{runs}}

# The dev container for this repo, found by its dev-container label
_container:
    @podman ps -a --filter "label=devcontainer.local_folder={{root}}" --format '{{{{.Names}}' | head -1

_require-container:
    #!/usr/bin/env bash
    c=$(just _container)
    [ -n "$c" ] && [ "$(podman inspect -f '{{{{.State.Running}}' "$c")" = "true" ] || { echo "The dev container isn't running. Run: just up"; exit 1; }

_require-up: _require-container
    #!/usr/bin/env bash
    curl -s -m 3 -o /dev/null localhost:3000 || { echo "que isn't running. Run: just up"; exit 1; }
