# que

An internal agent for Lotus and Luna. A user asks a question in chat; the agent answers it with the services that user has connected (Odoo first).

que is a generic harness. It knows nothing about any one service: everything it can do comes from packages it finds in `harness/packages/`.

## How it works

- **Packages**: one folder per service, written against one small contract (`harness/platform/core/package-spec.ts`): what the service is, the credential it needs, its operations and its skills. To add a capability, add a folder. The harness code does not change. Packages import no agent framework, so another harness can load the same folder through a thin adapter. The contract is in `harness/packages/package.md`.
- **Validation**: the harness checks every package when it mounts it (names, schemas, a description on every field) and stops on the first one that is wrong.
- **Per-user access**: a user connects a service in Settings > Connections. Credentials are stored encrypted in Postgres. The agent is built per user, from only the packages that user has connected.
- **Environment legibility**: the agent does not get every operation up front. Its system prompt explains what a package is and lists the ones the user can use; it opens a package to see what is inside and loads the operations it needs (`harness/agent/src/legibility/`). The harness knows the package contract, never a specific package.
- **Shared domain types**: Company, Address and Buyer are each defined once (`harness/packages/odoo/ontology.ts`) and every operation returns them.
- **Evals**: real user requests run against the live agent, each several times, scored on the tool the agent picks and the arguments it sends.

Built with LangChain `createAgent` on the LangGraph dev server, Next.js with assistant-ui, and Postgres.

## Layout

Two apps in one repo. Each has its own `package.json`, lockfile, lint and format config, and neither imports from the other.

- `harness/`: the agent and everything it loads
    - `agent/`: mounts packages, builds the agent per user, serves the graph and the `/que/*` API
    - `packages/`: capability packages only, one folder per service
    - `platform/`: the package contract (`@que/core`) and platform services (identity, users, credentials)
    - `evals/`: the eval cases and runner
- `ui/`: the chat UI (see `ui/README.md`)
- `scripts/db.sh`: the Postgres container

## Setup

Needs podman and [just](https://just.systems). Node runs only inside the dev container, so `node_modules` never lands in this folder: never run npm on the host.

1. Copy `harness/agent/.env.example` to `harness/agent/.env` and `ui/.env.example` to `ui/.env.local`, and fill them in
2. `just up`. The first run builds the dev container and installs each app's packages
3. Open http://localhost:3000 and connect Odoo in Settings > Connections

## Commands

- `just up` / `just down`: start or stop everything
- `just logs`: follow the agent server and UI logs
- `just check`: typecheck, lint, format check and unit tests, for each app. On a pull request the same checks run only for the app that changed; a change to a root file runs both (`.github/workflows/checks.yml`)
- `just format`: format every file in both apps with Prettier
- `just test`: end to end tests in a browser (`ui/tests/e2e`) (needs `just up`; some need Odoo connected)
- `just eval`: evals against the live agent (needs `just up` and Odoo connected)

Anything else runs in the container: `podman exec -u node -w "$PWD/harness" <container> <command>` (or `"$PWD/ui"`). `just _container` prints the container's name.
