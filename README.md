# que

que is a generic agent harness. A user asks a question in chat; the agent answers it with the services that user has connected.

It knows nothing about any one service or any one company: everything it can do comes from packages, and which packages is decided by a deployment. A deployment is a folder of its own, outside this repo. It starts que, and que mounts the packages that deployment lists. This repo holds no package and no deployment.

## How it works

- **Deployments**: one folder per way to start que, kept outside this repo, written against one small contract (`server/contract/deployment-spec.ts`): its name, the package folders it uses, and the agent configs it can run. A deployment starts que: its `start` script runs `just up` with its own folder, so the deployment names que and que does not name it. Nothing in que's own folder picks a deployment, and que stops at startup when it is handed none. A deployment and its packages can sit outside que: que gives them `@que/core` and `zod` (`server/contract/package.md`).
- **Packages**: one folder per service, kept in the deployment that uses it, written against one small contract (`server/contract/package-spec.ts`, and `server/contract/skill-spec.ts` for a skill): what the service is, the credential it needs, its operations and its skills. To add a capability, add a folder and list it in the deployment. The harness code does not change. Packages import no agent framework, so another harness can load the same folder through a thin adapter. The contract is in `server/contract/package.md`.
- **Validation**: the harness checks the deployment's definition, each agent config, and every package and skill when it mounts them (names, schemas, a description on every field). It stops at startup on the first thing that is wrong, and the error lists each fault in it.
- **Agent**: a deployment can say how its agent runs, in an agent config: a file of its own, made with `defineAgent` and listed in `agents` in the deployment's `index.ts` (`server/contract/agent-spec.ts`). A deployment can list several. A run names the one it wants, with `agent` in its `configurable`, and a run that names none gets the first. A deployment that lists none runs on que's own choices. A config has a `name`; each other field is optional, and what is left out has que's own value.
    - `packages`: the names of the packages the agent gets, out of the ones the deployment mounts. Left out, it gets every one. A name the deployment does not mount stops que at startup
    - `model`: the model the agent is built with, as `provider:model`. Left out, it is `MODEL` from the deployment's `.env`, and with no `MODEL`, the one named in `server/harness/src/run/model.ts`
    - `instructions`: the text that opens the system prompt, in place of que's own role text
    - `legibility`: the name of the way the model is shown its packages (see Environment legibility). One exists, `on-demand`
- **Per-user access**: a user connects a service in Settings > Connections. Credentials are stored encrypted in Postgres. The agent is built per user, from only the packages that user has connected. The `packages` of the `agent` block can take packages out of that set, and can add none.
- **Environment legibility**: the agent does not get every operation up front. Its system prompt explains what a package is and lists the ones the user can use; it opens a package to see what is inside and loads the operations it needs (`server/harness/src/assemble/on-demand/`, one config on the shared base in `server/harness/src/assemble/`). The harness knows the package contract, never a specific package.

Built with LangChain `createAgent` on the LangGraph dev server, Next.js with assistant-ui, and Postgres.

## Layout

Two apps in one repo. Each has its own `package.json`, lockfile, lint and format config, and neither imports from the other.

- `server/`: the contract, the backend and the harness
    - `contract/`: the package and deployment contracts (`@que/core`), and `package.md`, the package contract in words. The packages themselves are in deployments
    - `backend/`: the services the harness stands on (`identity/`, `users/`, `credentials/`)
    - `harness/`: the agent (`@que/agent`). In `src/`, in the order the work flows, and the only way an import points:
        - `mount/`: reads the deployment and the packages it lists
        - `access/`: the packages one user can use, their connections, and the users
        - `assemble/`: puts those packages in front of the model, as one config
        - `run/`: builds the agent per user, serves the graph and the `/que/*` API, and the CLI
    - `agents/`: que's own agent configs. Each one names no package, so any deployment can list it by its path. `chat.ts` is the agent a chat gets, with que's own choices written out
    - `tests/integration/`: the tests that mount folders from disk
- `ui/`: the chat UI (see `ui/README.md`)
- `templates/deployment/`: an empty deployment to copy: its definition, one agent config, its `.env.example`, and its `start`, `stop`, `logs` and `check` scripts
- `scripts/db.sh`: the Postgres container
- `scripts/container.sh`: the dev container, made so it can see a deployment's folder

## Setup

Needs podman and [just](https://just.systems). Node runs only inside the dev container, so `node_modules` never lands in this folder: never run npm on the host.

1. Copy `templates/deployment/` to a folder of your own, outside this repo. That folder is your deployment
2. In it, copy `.env.example` to `.env` and fill it in. A deployment's settings and secrets are kept there, and none in this repo
3. Put its packages in it and list their folders in its `index.ts`. A package folder outside que needs a `package.json` with `"type": "module"`, or one above it
4. Copy `ui/.env.example` to `ui/.env.local` in this repo and fill it in
5. Set `QUE_HOME` to this repo's folder, and run the deployment's `start`. The first run builds the dev container and installs each app's packages. Starting a deployment from a new folder makes the container again, so that it can see that folder
6. Open http://localhost:3000 and connect the deployment's services in Settings > Connections

## Commands

From a deployment's folder:

- `./start`: start everything, from that deployment. It runs `just up <deployment folder>`
- `./stop`: stop everything. It runs `just down`
- `./logs`: follow the agent server and UI logs. It runs `just logs`
- `./check`: type check the deployment's own code and run its tests, with que's contract handed to both. It runs `just check-deployment <deployment folder>`

From this repo, for que's own code:

- `just check`: typecheck, lint, format check, and the unit and integration tests, for each app. On a pull request the same checks run only for the app that changed; a change to a root file runs both (`.github/workflows/checks.yml`)
- `just format`: format every file in both apps with Prettier
- `just test`: end to end tests in a browser (`ui/tests/e2e`). They need a deployment started, and most were written against one deployment's services and name

Anything else runs in the container: `podman exec -u node -w "$PWD/server" <container> <command>` (or `"$PWD/ui"`). `just _container` prints the container's name.
