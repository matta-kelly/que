# que

An internal agent for Lotus and Luna wholesale reps. A rep asks a question in chat; the agent answers it with the services that rep has connected (Odoo first).

que is a generic harness. It knows nothing about any one service: everything it can do comes from packages it finds in `packages/`.

## How it works

- **Packages**: one folder per service, written against one small contract (`platform/core`): what the service is, the credential it needs, its operations and its skills. To add a capability, add a folder. The harness code does not change. Packages import no agent framework, so another harness can load the same folder through a thin adapter. The contract is in `packages/package.md`.
- **Validation**: the harness checks every package when it mounts it (names, schemas, a description on every field) and stops on the first one that is wrong.
- **Per-rep access**: a rep connects a service in Settings > Connections. Credentials are stored encrypted in Postgres. The agent is built per rep, from only the packages that rep has connected.
- **Retrieval**: what the model sees about the mounted packages is one swappable unit (`agent/src/retrieval/`). Today every operation is sent as a tool on every call.
- **Shared domain types**: Company, Address and Buyer are each defined once (`packages/odoo/ontology.ts`) and every operation returns them.
- **Evals**: real rep requests run against the live agent, each several times, scored on the tool the agent picks and the arguments it sends.

Built with LangChain `createAgent` on the LangGraph dev server, Next.js with assistant-ui, and Postgres.

## Layout

- `agent/`: the harness. Mounts packages, builds the agent per rep, serves the graph and the `/que/*` API
- `packages/`: capability packages only, one folder per service
- `platform/`: the package contract (`@que/core`) and platform services (identity, users, credentials)
- `ui/`: the chat UI (see `ui/README.md`)
- `evals/`: the eval cases and runner
- `scripts/db.sh`: the Postgres container

## Setup

Needs podman and [just](https://just.systems). Node runs only inside the dev container, so `node_modules` never lands in this folder: never run npm on the host.

1. Copy `agent/.env.example` to `agent/.env` and `ui/.env.example` to `ui/.env.local`, and fill them in
2. `just up`. The first run builds the dev container and installs packages
3. Open http://localhost:3000 and connect Odoo in Settings > Connections

## Commands

- `just up` / `just down`: start or stop everything
- `just logs`: follow the agent server and UI logs
- `just check`: typecheck, lint, format check and unit tests. The same checks run on every pull request (`.github/workflows/checks.yml`)
- `just format`: format every file with Prettier
- `just test`: end to end tests in a browser (`ui/tests/e2e`) (needs `just up`; some need Odoo connected)
- `just eval`: evals against the live agent (needs `just up` and Odoo connected)

Anything else runs in the container: `podman exec -u node -w "$PWD" <container> <command>`. `just _container` prints the container's name.
