---
type: component
description: the package contract for que. Framework-free folders + plain TS; the harness loads what they declare
status: draft
---
One package = one concern. No Pi or LangChain imports inside; each harness gets a thin adapter. A package is a folder kept in the deployment that uses it; que holds none. The contract (`@que/core`, in `server/contract/package-spec.ts`) and the backend services (identity, users, credentials, in `server/backend/`) are in que. A deployment (a folder with an `index.ts`, made with `defineDeployment` from `@que/core`) lists the folders of the packages it uses, and que mounts those and no other.

## Anatomy
```
packages/<name>/
  index.ts       ← required: default export, the definition
  package.json   ← needed, here or in a folder above: it says `"type": "module"`
  client.ts      ← optional: only if it talks to a service
  ontology.ts    ← optional: the domain types its ops return (zod schemas + row mappers), defined once
  ops/index.ts   ← optional: exports ops[]
  index.test.ts  ← optional: node:test, no network: validatePackage + each op against a fake connection
  skills/<skill>/SKILL.md  ← optional
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

## Operation
- `{ name, title, description, schema (zod), run(ctx, params) }`
- `ctx.conn` is the connection, if any. Never the credential
- the model sees it as `<package>_<name>` (`odoo_getCompany`)
- the description is the tool card: when to use it and which op to use instead, what it returns, its limits

## Validation
- `validatePackage` in `@que/core`; mount runs it on every folder a deployment lists, and fails loudly
- package and op names match `^[a-zA-Z0-9_-]{1,64}$`; `<package>_<op>` is ≤ 64 chars; op names unique
- package and ops carry a title and description; `schema` is a `z.object` and every field has `.describe()`
- `parseSkill` in `@que/core` checks each skill; mount runs it on every `SKILL.md`, and a skill with no title or no description stops the mount

## The deployment's agent
- a deployment can write an `agent` block beside `name` and `packages`, to say how its agent runs. The contract is `AgentDefinition` in `server/contract/agent-spec.ts`
```ts
export default defineDeployment({
  name: "shop",
  packages: ["./packages/orders", "./packages/notes"],
  agent: {
    packages: ["orders"],
    model: "provider:model-name",
    instructions: "You help the sales team.",
  },
});
```
- the block is optional, and so is each field. What is left out has que's own value
- `packages`: names of packages, not folders. The agent gets these and no other, and of these, only the ones the user can reach. Left out: every package the deployment mounts. `[]`: none
- `model`: as `provider:model`. Left out: `MODEL` from the environment, and with no `MODEL`, the one named in que
- `instructions`: opens the system prompt, in place of que's own role text. The rest of the prompt does not change
- `validateAgent` in `@que/core`; `validateDeployment` runs it, and its faults are listed in the deployment's one error: a field that is not one of the three, a `packages` that is not a list of names, a `model` or an `instructions` that is empty or only spaces
- mount stops when `packages` names a package the deployment does not mount, and the error names it
- a package is written with no knowledge of this block

## Client (gatekeeper)
- `connect(credential) → connection`
- owns auth + protocol; throws `OperationFailed` for every service error
- bounds every request with a timeout; messages say which failure it was (timeout, unreachable, HTTP status, service error) so the model can tell the user what to do

## Results vs failures
- nothing found = a normal result
- lists are capped; when more match, the result carries a `note` saying how to get the next page
- real failure = one thrown `OperationFailed`

## Skills
- `SKILL.md` with `title` + `description` frontmatter; read on demand
- the contract defines a skill (`Skill` and `parseSkill`, in `server/contract/skill-spec.ts`); mount reads the file and hands it the text

## Not yet
- `context/`, `bin/`, code mode, npm distribution
