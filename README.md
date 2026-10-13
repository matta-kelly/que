# que

que is a generic agent harness. A user asks a question in chat; the agent answers it with the services that user has connected.

It knows nothing about any one service or any one company: everything it can do comes from packages, and which packages is decided by a deployment. A deployment is a folder of its own, outside this repo. It starts que, and que mounts the packages that deployment lists. This repo holds no package and no deployment.

## How it works

- **Deployments**: one folder per way to start que, kept outside this repo, written against one small contract (`server/contract/deployment-spec.ts`): its name, the package folders it uses, and the agent configs it can run. A deployment starts que: its `start` script runs `just up` with its own folder, so the deployment names que and que does not name it. Nothing in que's own folder picks a deployment, and que stops at startup when it is handed none. A deployment and its packages can sit outside que: que gives them `@que/core` and `zod` (`server/contract/package.md`).
- **Packages**: one folder per service, kept in the deployment that uses it, written against one small contract (`server/contract/package-spec.ts`, and `server/contract/skill-spec.ts` for a skill): what the service is, the credential it needs, its operations and its skills. To add a capability, add a folder and list it in the deployment. The harness code does not change. Packages import no agent framework, so another harness can load the same folder through a thin adapter. The contract is in `server/contract/package.md`.
- **Validation**: the harness checks the deployment's definition, each agent config, and every package and skill when it mounts them (names, schemas, a description on every field). It stops at startup on the first thing that is wrong, and the error lists each fault in it.
- **Model**: a model is a model config: a file of its own, made with `defineModel` and listed in `models` in the deployment's `index.ts` (`server/contract/model-spec.ts`). It has a `name`, the provider's `id` as `provider:model`, a `window` (the most tokens it takes in) and a `maxTokens` (the most it gives in one reply). An agent config names one with `model`, and a run can name another, with `model` in its `configurable`. A run that names none, under an agent that names none, gets the first the deployment lists, and with none listed, que's own. There is no `MODEL` setting: a deployment that sets it stops at startup.
- **Traces**: que sends a trace of each run the agent server makes to the deployment's Langfuse, when its `.env` has `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL` (`server/harness/src/run/trace.ts`). With none of the three it sends nothing, and with one or two it stops at startup. A trace holds each model call and each tool call of the run, with its input, its output and its times, and says who the run was for (the que user id), its thread (as the session), the agent config it ran under, and the commit que runs from. A Langfuse that refuses a trace or cannot be reached does not stop a run. A failed send is silent unless the `.env` has `OTEL_LOG_LEVEL=error`. The CLI chat is not traced.
- **Loop**: a deployment can say how an agent's loop is run, in a loop config: a file of its own, made with `defineLoop` and listed in `loops` in the deployment's `index.ts` (`server/contract/loop-spec.ts`). An agent config names one with `loop`, and one that names none runs as it does with no loop. A loop names its `engine`: `plain`, the framework's own agent, or `deepagents`, a LangChain deep agent handed que's prompt, tools and tool rule. On `deepagents`, `result.max` acts: a larger tool result is kept in the thread's file store, and the chat gets its head, its tail and its path. The model also gets that engine's own tools (files, and a subagent). `summarize` acts too: past a share of the model's window, the old part of the chat is sent as a summary. `args` and `limits` do not act yet (`server/contract/package.md`).
- **Agent**: a deployment can say how its agent runs, in an agent config: a file of its own, made with `defineAgent` and listed in `agents` in the deployment's `index.ts` (`server/contract/agent-spec.ts`). A deployment can list several. A run names the one it wants, with `agent` in its `configurable`, and a run that names none gets the first. A deployment that lists none runs on que's own choices. A config has a `name`; each other field is optional, and what is left out has que's own value.
    - `packages`: the names of the packages the agent gets, out of the ones the deployment mounts. Left out, it gets every one. A name the deployment does not mount stops que at startup
    - `model`: the name of a model config the deployment lists. Left out, it is the first model the deployment lists, and with none listed, que's own
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
        - `run/`: builds the agent per user, with the engine its loop names (`run/engine/`), sends the trace of each run to Langfuse (`run/trace.ts`), serves the graph and the `/que/*` API, and the CLI
    - `loops/`: que's own loop configs, which any deployment can list by its path. `long-chat.ts` holds que's own value for each setting, `short-run.ts` is for a run with one job and no person, and `deep.ts` is run as a LangChain deep agent
    - `models/`: que's own model configs, which any deployment can list by its path: `glm-flash.ts`, `deepseek-flash.ts` and `minimax-m3.ts`
    - `agents/`: que's own agent configs. Each one names no package, so any deployment can list it by its path, with the loop and the model it names. `chat.ts` is the agent a chat gets, with que's own choices written out, and `deep-chat.ts` is the same agent on the `deep` loop
    - `evals/`: the eval runner (`@que/evals`). It reads a deployment's cases and agent configs, runs each case against a running que over HTTP, and prints the runs. When the deployment's `.env` has `QUE_JUDGE`, the name of one of its model configs, that model judges each finished run on the `good` of its case (`evals/src/judge.ts`). When the deployment's `.env` has `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`, it also sends the runs to that Langfuse: the cases as one dataset, and the runs under each agent config as one experiment run (`evals/src/langfuse.ts`). It imports the contract, and nothing from the harness or the backend
    - `tests/integration/`: the tests that mount folders from disk
- `ui/`: the chat UI (see `ui/README.md`)
- `templates/deployment/`: an empty deployment to copy: its definition, one agent config, one loop config, one model config, its `.env.example`, and its `start`, `stop`, `logs`, `check` and `eval` scripts
- `scripts/db.sh`: the Postgres container
- `scripts/container.sh`: the dev container, made so it can see a deployment's folder

## Setup

Needs podman and [just](https://just.systems). Node runs only inside the dev container, so `node_modules` never lands in this folder: never run npm on the host.

1. Copy `templates/deployment/` to a folder of your own, outside this repo. That folder is your deployment
2. In it, copy `.env.example` to `.env` and fill it in. A deployment's settings and secrets are kept there, and none in this repo
   - que makes a `.que/` folder in it when a start learns a fact of a model: the saved copy of what it learned of the deployment's models (window and price). It is run state, and the template leaves it out of git
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
- `./eval`: run each case of the deployment's packages against que, under each of its agent configs, and print what the agent did. que has to be up. `--agent <name>`, one or more times, runs only those configs. The runs act on the real services. When the `.env` sets `QUE_JUDGE` to the name of a model config the deployment lists, that model judges each run that finished: it is asked if the `good` of the case is true of the run, and the report has its verdict (pass, fail or none) and its reason under the run, and how many runs passed under each agent config. A verdict of fail stops nothing. A name the deployment does not list stops `./eval` before any run. With no `QUE_JUDGE`, nothing grades a run. When the `.env` has `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`, the runs also go to the deployment's Langfuse, as one experiment run for each agent config, named by the config and the commit of que, with each verdict of pass or fail as the score `good` on its run, and a link to each is printed under the report. With none of the three it only prints the runs, and with one or two it stops before any run. It runs `just eval <deployment folder>`

From this repo, for que's own code:

- `just check`: typecheck, lint, format check, and the unit and integration tests, for each app. On a pull request the same checks run only for the app that changed; a change to a root file runs both (`.github/workflows/checks.yml`)
- `just format`: format every file in both apps with Prettier
- `just test`: end to end tests in a browser (`ui/tests/e2e`). They need a deployment started, and most were written against one deployment's services and name
- `tests/e2e/trace.sh <deployment folder>`: checks against the real Langfuse that que sends the trace of a run. It needs the deployment started, with the Langfuse settings in its `.env`, and it makes one model call

Anything else runs in the container: `podman exec -u node -w "$PWD/server" <container> <command>` (or `"$PWD/ui"`). `just _container` prints the container's name.
