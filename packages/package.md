---
type: component
description: the package contract for que. Framework-free folders + plain TS; the harness loads what they declare
status: draft
---
One package = one concern. No Pi or LangChain imports inside; each harness gets a thin adapter. `packages/` holds only capability packages; the contract (`@que/core`) and platform services (identity, users, credentials) live in `platform/`.

## Anatomy
```
packages/<name>/
  package.json   ← @que/<name>
  index.ts       ← default export: the definition
  client.ts      ← only if it talks to a service
  ontology.ts    ← the domain types its ops return (zod schemas + row mappers), defined once
  ops/index.ts   ← exports ops[]
  test.ts        ← node:test, no network: validatePackage + each op against a fake connection
  skills/<skill>/SKILL.md
```

## Definition
- `name`, `title`, `description`
- `credential`: optional zod schema of what it needs. Resolved per rep; unresolved → not loaded for that rep
- `connect`, `ops`

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
- bounds every request with a timeout; messages say which failure it was (timeout, unreachable, HTTP status, service error) so the model can tell the rep what to do

## Results vs failures
- nothing found = a normal result
- lists are capped; when more match, the result carries a `note` saying how to get the next page
- real failure = one thrown `OperationFailed`

## Skills
- `SKILL.md` with `title` + `description` frontmatter; read on demand

## Not yet
- `context/`, `bin/`, code mode, npm distribution
