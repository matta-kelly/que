---
type: component
description: the package contract for que. Framework-free folders + plain TS; the harness loads what they declare
status: draft
---
One package = one concern. No Pi or LangChain imports inside; each harness gets a thin adapter. `packages/` holds only capability packages; the contract (`@que/core`, in `platform/core/package-spec.ts`) and platform services (identity, users, credentials) live in `platform/`. A deployment (`deployments/<name>/index.ts`, made with `defineDeployment` from `@que/core`) lists the packages it uses, each by its folder; que mounts those and no other.

## Anatomy
```
packages/<name>/
  index.ts       ← required, and the only required file: default export, the definition
  package.json   ← optional: only if it has dependencies of its own
  client.ts      ← optional: only if it talks to a service
  ontology.ts    ← optional: the domain types its ops return (zod schemas + row mappers), defined once
  ops/index.ts   ← optional: exports ops[]
  index.test.ts  ← optional: node:test, no network: validatePackage + each op against a fake connection
  skills/<skill>/SKILL.md  ← optional
```

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
- `validatePackage` in `@que/core`; mount runs it on every folder and fails loudly
- package and op names match `^[a-zA-Z0-9_-]{1,64}$`; `<package>_<op>` is ≤ 64 chars; op names unique
- package and ops carry a title and description; `schema` is a `z.object` and every field has `.describe()`

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

## Not yet
- `context/`, `bin/`, code mode, npm distribution
