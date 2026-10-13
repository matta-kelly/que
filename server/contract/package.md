---
type: component
description: the package contract for que. Framework-free folders + plain TS; the harness loads what they declare
status: draft
---
One package = one concern. No Pi or LangChain imports inside; each harness gets a thin adapter. A package is a folder kept in the deployment that uses it; que holds none. The contract (`@que/core`, in `server/contract/package-spec.ts`) and the backend services (identity, users, credentials, in `server/backend/`) are in que. A deployment (a folder with an `index.ts`, made with `defineDeployment` from `@que/core`) lists the folders of the packages it uses, and que mounts those and no other.

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
  model: "provider:model-name",
  instructions: "You help the sales team.",
  legibility: "on-demand",
});
```
```ts
// index.ts
export default defineDeployment({
  name: "shop",
  packages: ["./packages/orders", "./packages/notes"],
  agents: ["./agents/chat.ts", "./agents/lean.ts"],
});
```
- `agents` is optional. A deployment that lists none runs on que's own choices. An entry is the path of the file: absolute, or taken from the deployment's own folder. A file that is not listed is not read
- `name`: required. What a run names to get this config. Each other field is optional, and what is left out has que's own value
- `packages`: names of packages, not folders. The agent gets these and no other, and of these, only the ones the user can reach. Left out: every package the deployment mounts. `[]`: none
- `model`: as `provider:model`. Left out: `MODEL` from the environment, and with no `MODEL`, the one named in que
- `instructions`: opens the system prompt, in place of que's own role text. The rest of the prompt does not change
- `legibility`: the name of the way the model is shown its packages. One exists, `on-demand`, and it is the one a config gets when it names none
- which config a run gets
	- a run names one with `agent` in its `configurable`: `{ configurable: { agent: "lean" } }`
	- a run that names none gets the first one the deployment lists. So the chat is the first file
	- a name the deployment does not have fails the run, and the error lists the names it has
- `validateAgent` in `@que/core`; mount runs it on each file a deployment lists, and its faults are in one error: a name that is missing or is not a plain name, a field that is not in the shape, a `packages` that is not a list of names, a `model` or an `instructions` that is empty or only spaces, a `legibility` que does not have
- mount stops when a listed file does not exist, when two configs have one name, and when `packages` names a package the deployment does not mount. The error names the file, the name, or the config and the package
- a deployment that still writes an `agent` block stops at startup, and the error says a config is now a file
- a package is written with no knowledge of a config

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
- cases are not in the definition, and no agent is given one. Nothing runs a case yet

## Not yet
- `context/`, `bin/`, code mode, npm distribution
