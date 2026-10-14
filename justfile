# que commands. The database runs in its own container (que-postgres);
# everything else runs in the dev container. A deployment's scripts call these
# with `just --justfile`; the ones that work on que's own code run from anywhere in the repo.

root := justfile_directory()

# List the commands
default:
    @just --list

# Start the database, the dev container, the agent server and the UI, from one deployment folder.
# Nothing in que picks the deployment: a deployment starts que this way from its own `just start`.
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

# Type check a deployment's own code and the packages it lists, and run their tests, with que's contract handed to all of them,
# and check its cases against the capabilities of their packages.
# A package can sit outside the deployment's folder; each one it lists is checked.
check-deployment deployment:
    #!/usr/bin/env bash
    set -euo pipefail
    dep=$(cd "{{invocation_directory()}}" && cd "{{deployment}}" && pwd)
    cd "{{root}}"
    c=$(./scripts/container.sh "$dep")
    h="{{root}}/server"
    mapfile -t pkgs < <(podman exec -u node -w "$h" "$c" npx tsx harness/src/mount/list-packages.ts "$dep")
    just --justfile "{{root}}/justfile" _check-folders "$c" "$dep" "${pkgs[@]}"
    # The cases, and the agent and model configs, read as `just eval` reads them.
    podman exec -u node -w "$h/evals" "$c" npx tsx --import "$h/harness/src/mount/supply.ts" src/check.ts "$dep"

# Type check any folder of TypeScript and run its tests, with que's contract handed to it: a package, or code that sits beside a deployment
check-folder folder:
    #!/usr/bin/env bash
    set -euo pipefail
    dir=$(cd "{{invocation_directory()}}" && cd "{{folder}}" && pwd)
    cd "{{root}}"
    c=$(./scripts/container.sh "$dir")
    just --justfile "{{root}}/justfile" _check-folders "$c" "$dir"

# The folders have no install of their own: the compiler is told where que keeps what they import.
_check-folders container +folders:
    #!/usr/bin/env bash
    set -euo pipefail
    h="{{root}}/server"
    folders=({{folders}})
    include=$(printf '"%s/**/*.ts",' "${folders[@]}"); include=${include%,}
    exclude=$(printf '"%s/**/node_modules",' "${folders[@]}"); exclude=${exclude%,}
    podman exec -i -u node "{{container}}" sh -c 'mkdir -p /tmp/que-check && cat > /tmp/que-check/tsconfig.json' <<EOF
    {
      "extends": "$h/harness/tsconfig.json",
      "compilerOptions": {
        "rootDir": "/",
        "typeRoots": ["$h/node_modules/@types"],
        "paths": { "@que/core": ["$h/contract/index.ts"], "zod": ["$h/node_modules/zod"] }
      },
      "include": [$include],
      "exclude": [$exclude]
    }
    EOF
    podman exec -u node -w "$h" "{{container}}" npx tsc --noEmit -p /tmp/que-check/tsconfig.json
    for f in "${folders[@]}"; do
        # A folder with no tests has nothing to run.
        [ -n "$(find "$f" -name '*.test.ts' -not -path '*/node_modules/*' -print -quit)" ] || continue
        echo "tests: $f"
        podman exec -u node -w "$f" "{{container}}" "$h/node_modules/.bin/tsx" --import "$h/harness/src/mount/supply.ts" --test "**/*.test.ts"
    done
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

# Run the browser tests that send no message to the model (needs a deployment started)
test: _require-up
    podman exec -u node -w "{{root}}/ui" "$(just _container)" npx playwright test --grep-invert @live

# Run the browser tests marked @live: each sends a message to the real model, or needs a real service connected.
# Each message is a model call that is paid for, and a trace when the deployment has a Langfuse.
test-live: _require-up
    podman exec -u node -w "{{root}}/ui" "$(just _container)" npx playwright test --grep @live

# The dev container for this repo, found by its dev-container label
_container:
    @podman ps -a --filter "label=devcontainer.local_folder={{root}}" --format '{{{{.Names}}' | head -1

_require-container:
    #!/usr/bin/env bash
    c=$(just _container)
    [ -n "$c" ] && [ "$(podman inspect -f '{{{{.State.Running}}' "$c")" = "true" ] || { echo "The dev container isn't running. Start a deployment: just start, in its folder"; exit 1; }

_require-up: _require-container
    #!/usr/bin/env bash
    curl -s -m 3 -o /dev/null localhost:3000 || { echo "que isn't running. Start a deployment: just start, in its folder"; exit 1; }
