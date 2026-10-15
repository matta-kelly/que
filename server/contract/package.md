---
type: component
description: the package contract for que. Framework-free folders + plain TS; the harness loads what they declare
status: running
---
One package = one concern. No Pi or LangChain imports inside; each harness gets a thin adapter. A package is a folder of the deployment's own: inside its folder, or beside it in the same repo (a repo's `packages/`). que holds none. The contract (`@que/core`, in `server/contract/package-spec.ts`) and the backend services (identity, users, credentials, in `server/backend/`) are in que. A deployment (a folder with an `index.ts`, made with `defineDeployment` from `@que/core`) lists the folders of the packages it uses, and que mounts those and no other.

## What it is for
- two kinds, by what it touches ([[capability]])
	- connector: one resource
	- domain: logic across connectors
- a capability lives in one package: an outcome the package gives, made from its ops and skills
- an op is shown to be right by its tests. A capability is shown to work by its cases ([[evals]])
- the contract knows ops, skills, capabilities and cases. It does not know a kind

## Anatomy
```
packages/<name>/
  index.ts       ← required: default export, the definition
  package.json   ← needed, here or in a folder above: it says `"type": "module"`
  client.ts      ← optional: only if it talks to a service
  ontology.ts    ← optional: the domain types its ops return (zod schemas + row mappers), defined once
  ops/index.ts   ← optional: exports ops[]
  cases.ts       ← optional: the cases of its capabilities, made with defineCases
  index.test.ts  ← optional: node:test, no network: validatePackage, validateCases + each op against a fake connection
  skills/<skill>/SKILL.md  ← optional: one for each skill the definition lists
```

## Where it sits
- a package can sit in any folder, inside que or outside it
- que gives it `@que/core` and `zod`, so a folder outside que needs no install for them
- the names que supplies are exactly `@que/core` and `zod`
- the folder, or one above it such as the deployment's, has a `package.json` with `"type": "module"`

## Definition
- made with `definePackage` from `@que/core`
- `name`, `title`, `description`: required. Identity is the only required part
- `credential`: optional zod schema of what it needs. Resolved per user; unresolved → not loaded for that user
- `connect`: optional
- `whoami`: optional. Who the connection is logged in as
- `ops`: optional
- `skills`: optional. The names of its skills
- `capabilities`: optional. Each one `{ name, title, description }`
- the definition lists all that a package gives to an agent. What it does not list, the harness does not read

## Operation
- `{ name, title, description, schema (zod), run(ctx, params) }`
- `ctx.conn` is the connection, if any. Never the credential
- the model sees it as `<package>_<name>` (`odoo_getCompany`)
- the description is the tool card: when to use it and which op to use instead, what it returns, its limits

## Validation
- `validatePackage` in `@que/core`; mount runs it on every folder a deployment lists, and fails loudly
- package and op names match `^[a-zA-Z0-9_-]{1,64}$`; `<package>_<op>` is ≤ 64 chars; op names unique
- package and ops carry a title and description; `schema` is a `z.object` and every field has `.describe()`
- skill names and capability names match the same pattern, and are unique in the package; a capability carries a title and description
- `parseSkill` in `@que/core` checks each skill; mount runs it on the `SKILL.md` of each skill the definition lists, and a skill with no title or no description stops the mount
- `validateCases` in `@que/core` checks the cases of a package against its definition. The package's own test runs it. Mount does not: a bad case never stops que

## The deployment's agents
- an agent config is one way a deployment's packages are run. It is a file of its own, made with `defineAgent`, and the deployment lists it in `agents`, as it lists package folders in `packages`. The contract is `AgentDefinition` in `server/contract/agent-spec.ts`
```ts
// agents/chat.ts
export default defineAgent({
  name: "chat",
  packages: ["orders"],
  model: "glm-flash",
  instructions: "You help the sales team.",
  loading: "on-demand",
  loop: "nightly",
  userInstructions: true,
});
```
```ts
// index.ts
export default defineDeployment({
  name: "shop",
  packages: ["./packages/orders", "./packages/notes"],
  agents: ["./agents/chat.ts", "./agents/lean.ts"],
  loops: ["./loops/nightly.ts"],
});
```
- an agent file, as a package, has a `package.json` with `"type": "module"` in its folder or one above. A deployment's own has the deployment's, and que's have `server/package.json`
- que keeps agent configs of its own in `server/agents/`. Each names no package, so any deployment can list it by its path. `chat` is the chat agent
- `agents` is optional. A deployment that lists none runs on que's own choices. An entry is the path of the file: absolute, or taken from the deployment's own folder. A file that is not listed is not read
- `name`: required. What a run names to get this config. Each other field is optional, and what is left out has que's own value
- `packages`: names of packages, not folders. The agent gets these and no other, and of these, only the ones the user can reach. Left out: every package the deployment mounts. `[]`: none
- `model`: the name of a model config the deployment lists. Left out: the first model the deployment lists, and with none listed, que's own. See [the deployment's models](#the-deployments-models)
- `instructions`: opens the system prompt, in place of que's own role text. The rest of the prompt does not change
- `loading`: the name of the way the model is shown its packages, and when it gets their operations. One exists, `on-demand`, and it is the one a config gets when it names none
- `loop`: the name of a loop config the deployment lists: how the agent's loop is run. Left out: que's own value for each setting. See [the deployment's loops](#the-deployments-loops)
- `userInstructions`: `true`, and the agent's system prompt gets the user's own instructions, in `## You`, after the line that names the user. `false` or left out: it gets none. The agent's `instructions` come first, and the prompt says they stand where the two do not agree
	- where the text is from is not in the agent config. The deployment's `.env` can name a file with `DEV_USER_INSTRUCTIONS`: absolute, or taken from the deployment's own folder. It is read for each run, and que stops at startup when it cannot be read. With no file named, the text is the one the user saved in Settings, in Account, of at most 16,000 characters
	- a named file is the text of every user of the deployment, and the text of an account is then not used and cannot be changed
	- que's own `chat` says `true`
- which config a run gets
	- a run names one with `agent` in its `configurable`: `{ configurable: { agent: "lean" } }`
	- a run that names none gets the first one the deployment lists. So the chat is the first file
	- a name the deployment does not have fails the run, and the error lists the names it has
- `validateAgent` in `@que/core`; mount runs it on each file a deployment lists, and its faults are in one error: a name that is missing or is not a plain name, a field that is not in the shape, a `packages` that is not a list of names, an `instructions` that is empty or only spaces, a `model` that is not a plain name (one written as `provider:model` gets a fault that says a model is now a file), a `loading` que does not have, a field named `legibility` (the fault says it is now `loading`), a `userInstructions` that is not `true` or `false`
- mount stops when a listed file does not exist, when two configs have one name, when `packages` names a package the deployment does not mount, and when `loop` or `model` names one the deployment does not list. The error names the file, the name, or the config and what it names
- a deployment that still writes an `agent` block stops at startup, and the error says a config is now a file
- a package is written with no knowledge of a config

## The deployment's loops
- a loop config is one way an agent handles a chat as it grows, and how far one run can go. It is a file of its own, made with `defineLoop`, and the deployment lists it in `loops`, as it lists agent files in `agents`. The contract is `LoopDefinition` in `server/contract/loop-spec.ts`
```ts
// loops/nightly.ts
export default defineLoop({
  name: "nightly",
  result: { max: 60_000 },
  summarize: false,
  limits: { modelCalls: 15 },
});
```
```ts
// index.ts
export default defineDeployment({
  name: "shop",
  packages: ["./packages/orders"],
  agents: ["./agents/chat.ts"],
  loops: ["./loops/nightly.ts"],
});
```
- an agent config names a loop with `loop`, and a run of that agent is built with it. A loop no agent names is mounted and not used
- every agent is the framework's own agent (`createAgent`), with que's prompt, tools and tool rule, and one middleware for each setting that acts. Nothing else is added: two agents differ only where their configs do. The repair and the file store are middlewares of a LangChain deep agent (`deepagents`), each taken alone; the summary is LangChain's own
	- every agent repairs a chat that has a tool call with no result, which a run stopped between a call and its result leaves: the call gets a result that says it was cancelled, in the saved chat and in what the model is sent. It is the framework's own middleware (`createPatchToolCallsMiddleware` of `deepagents`), and no setting turns it off
	- `result` acts: a tool result over `result.max` goes to a file store kept in the thread's state, and the chat gets its head, its tail and its path. The model gets one tool more, `read_file`, and reads a stored result with it, by offset and limit. `result: false` turns that off, and the model has no `read_file`
	- `summarize` acts: past `summarize.at` of the model's window, the old part of the chat is sent as a summary, and `summarize.keep` of the window is sent as it is. que hands the middleware counts of tokens, each share times the `window` of the run's model. The summary takes the place of the old part in the thread, so the chat keeps the summary and not the old messages. It is LangChain's own middleware (`summarizationMiddleware`). `summarize: false` turns it off
	- `args` and `limits` do not act yet
- an agent config that names no loop gets one where neither setting acts: the chat is sent whole, and no result is moved out
- a loop file, as an agent file, has a `package.json` with `"type": "module"` in its folder or one above
- que keeps loop configs of its own in `server/loops/`, and a deployment can list one by its path. A deployment that lists one of que's agents lists the loop that agent names: `chat` names `long-chat`
	- `long-chat`: que's own value for each setting, written out
	- `short-run`: for a run with one job and no person
- `loops` is optional. An entry is the path of the file: absolute, or taken from the deployment's own folder. A file that is not listed is not read
- `name`: required. Each setting is optional, and so is each part of one. What is left out has que's own value, and a setting can be `false`: off
- `result.max`: in tokens. A tool result over it is not put in the chat whole. que's own: 20,000
- `summarize.at`: the share of the model's window past which the old part of the chat is sent as a summary. que's own: 0.85
- `summarize.keep`: the share of the window that is sent as it is. Below `at`. que's own: 0.1
- `args.max`: in characters. In the old part of a chat, a longer argument of a tool call is cut. que's own: 2,000
- `limits.modelCalls`, `limits.toolCalls`: the most of each that one run can make. que's own: 50 and 100
- `resolveLoop` in `@que/core` hands back every setting of a loop: its own value, que's where it has none, and `false` where it says so. `LOOP_DEFAULTS` holds que's own values
- `validateLoop` in `@que/core`; mount runs it on each file a deployment lists, and its faults are in one error: a name that is missing or is not a plain name, a field that is not in the shape, a setting that is not an object or `false`, a count that is not a whole number above zero, a share that is not above zero and below one, a `keep` that is not below `at`
- mount stops when a listed file does not exist, and when two loops have one name. The error names the file or the name

## The deployment's models
- a model config is one model a deployment's agents can run on. It is a file of its own, made with `defineModel`, and the deployment lists it in `models`, as it lists `agents` and `loops`. The contract is `ModelDefinition` in `server/contract/model-spec.ts`
```ts
// models/glm-flash.ts
export default defineModel({
  name: "glm-flash",
  id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
  maxTokens: 131_072,
});
```
- a model has two kinds of field. Choices, which the file has to write
	- `name`: what an agent config or a run names
	- `id`: the provider's model, as `provider:model`
	- `maxTokens`: the most tokens the model may give in one reply. Sent to the provider with each call. Not above `window`
- and facts, which the file can write, and which que fills in at mount when it does not
	- `window`: the most tokens the model takes in. A share in a loop's settings is a share of this. From the provider: for Fireworks, `contextLength` of its model record, read with the deployment's `FIREWORKS_API_KEY`
	- `price`: what the model costs, in dollars for one million tokens: `{ input, output, cachedInput }`. `cachedInput` is for tokens in that the provider read from its cache, and with none they cost as `input`. From `https://models.dev/api.json`, a public database of models: no provider gives its price as data
	- a value in the file wins, and que asks no source for it. So a deployment can pin a number, and a model that a source does not have can still run
	```ts
	export default defineModel({
	  name: "house-model",
	  id: "fireworks:accounts/acme/models/house",
	  maxTokens: 8_000,
	  window: 64_000,
	  price: { input: 0.2, output: 0.8 },
	});
	```
- que keeps the last good answer of each source in the deployment's folder, in `.que/model-facts.json`, by the model's id. A source that does not answer in 5 seconds, or answers with an error, is read from there. The file is run state, and is not in git
- mount stops when a model has no `window` or no `price` from its file, its source or the saved copy. The error names the model, the fact, the reason the source gave, and the field to write. A model with no price is not run as a free one
- a mounted model is whole: `MountedModel` in `@que/core`. `mountedModel(definition, facts)` makes one
- the code is in `server/harness/src/mount/model-facts/`: one file for each source, one for the saved copy, and `factSources`, which mount is handed. A test hands mount sources of its own, and calls no network
- which model a run gets, the first that holds
	- the one the run names, with `model` in its `configurable`: `{ configurable: { agent: "chat", model: "minimax-m3" } }`
	- the one its agent config names
	- the first one the deployment lists
	- que's own: `glm-flash`
- a name the deployment does not have fails the run, and the error lists the names it has
- each reply of the model in a run has the name of the model config that gave it, in `response_metadata.que.model`. que adds it on every run, and it is in the saved chat
- `GET /que/deployment` on the server says what a run can name: the deployment's agents, each with the model it gets when the run names none and, for an agent that summarizes, the share of the window it does so at (`summarizeAt`), and its models, each with its `window`, `maxTokens` and `price`. In the order listed, and with no provider id. The chat UI makes its pickers from it
- que keeps model configs of its own in `server/models/`, and a deployment lists one by its path: `glm-flash`, `deepseek-flash`, `minimax-m3`. A deployment that lists one of que's agents lists the model it names: `chat` names `minimax-m3`
- the provider of a model is one que has the package for. Today: `fireworks`. Another one is a package added to `server/harness`, an entry in `PROVIDERS` in `server/harness/src/mount/models.ts` (how the window of one of its models is read, and its name in the model database), and its key in the deployment's `.env`
- the `MODEL` setting is gone. A deployment that still sets it stops at startup, and the error says to list a model file
- a model file, as an agent file, has a `package.json` with `"type": "module"` in its folder or one above
- `validateModel` in `@que/core`; mount runs it on each file a deployment lists, and its faults are in one error
- mount stops when a listed file does not exist, when two models have one name, when a model has a provider que does not have, and when a model has no window or no price

## Client (gatekeeper)
- `connect(credential) → connection`
- owns auth + protocol; throws `OperationFailed` for every service error
- bounds every request with a timeout; messages say which failure it was (timeout, unreachable, HTTP status, service error) so the model can tell the user what to do

## Results vs failures
- nothing found = a normal result
- lists are capped; when more match, the result carries a `note` saying how to get the next page
- real failure = one thrown `OperationFailed`

## Skills
- the definition lists them by name: `skills: ["lookup-company"]`
- each one is a `skills/<name>/SKILL.md`, with `title` + `description` frontmatter; read on demand
- mount reads the ones listed, and no other. A folder in `skills/` that is not listed is not read. A listed skill with no file stops the mount
- the contract defines a skill (`Skill` and `parseSkill`, in `server/contract/skill-spec.ts`); mount reads the file and hands it the text

## Capabilities and cases
- a capability is an outcome the package gives. The definition names each one: `{ name, title, description }`
- a case is one behaviour of one capability: `{ name, capability, input, start, good }`. All five are text
	- `capability`: the name of a capability the package has
	- `input`: what the user says
	- `start`: what is true before the run
	- `good`: one statement that is true or false after the run
- the cases of a package are in `cases.ts`, made with `defineCases`. A capability can have many
- cases are not in the definition, and no agent is given one
- `just eval`, in a deployment, runs each case against que, under each agent config the deployment lists, and prints what the agent did: the calls, the results and the answer. Nothing grades a run: a person reads it against `good`
	- `start` is not set up. The run acts on the real service, so a case that changes data changes real data

## Not yet
- `context/`, `bin/`, code mode, npm distribution
