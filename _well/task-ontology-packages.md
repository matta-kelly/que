---
type: task
description: "Make an ontology a set of packages that depend on each other: a base ontology in que, and packages that extend it and import from each other, from wherever a package can come from. Reference when picking this up: what is wanted, where it stands, what is known, what is open, and what starts it."
status: planned
belongs_to: "[[que]]"
---
An ontology is made of packages that stack: a base in que, and packages that extend it and import from each other.
- [[#What is wanted]] the outcome
- [[#Where it stands]] what exists today
- [[#What is known]] the model, and how others do it
- [[#Open]] what has to be decided before a spec
- [[#Starts when]] what makes this worth doing
- [[#Done means]] how to tell it is finished

- [[que]]: the harness this belongs to
- [[ontology-northstar]]: the model this applies (everything is a package; packages stack as layers)
- [[task-packages-from-git]]: how a package comes from somewhere other than a folder on disk

---
## What is wanted

- **base**: the meta and the machinery (loader, lint). It lives in que, and every ontology extends it
- **packages**: each one brings its own types and nodes, and says what it depends on
	- extends: a package builds on another package's types. A capability model package extends base
	- imports: a package uses another package's nodes. A deployment's verb points at a connector's external object
	- a package comes from anywhere a package can come from: que, a shared repo, npm
- **deployment**: the top layer. It lists its packages, and the harness resolves them into one ontology, or refuses a set that does not resolve
- mount reads and lints the resolved ontology; init puts it in front of the agent

## Where it stands

- one ontology exists, in the lotusandluna vault (`~/cc/ontology`). Links do not cross vaults, so it is named here in plain text
	- meta, then types, then nodes. A type is a zod schema in `types.ts`; a node is a markdown note in `<group>/<type>/`
	- seven types: object, ledger, source, external object (things); verb (actions); capability, domain (capabilities)
	- its loader and lint are in the same folder. Generic checks and L&L checks are in one file
- it meets code by pointers from nodes into packages, checked by the lint
	- a source's `connector` names a package
	- an external object's `schema` points into that package's `schema.ts`
	- a capability's holder is a package that lists it and has cases for it
- que knows nothing of an ontology. A package declares `capabilities` and cases; nothing more

## What is known

- the pointers above are the first candidates for what que must carry. Each new pointer the lotusandluna work adds is one more (next: verb → op, object → row schema)
- how others do it
	- OWL and LinkML: a schema imports other schemas
	- PG-Schema: a graph type `IMPORTS` another
	- NixOS modules: many modules merge into one config, and a conflict fails the build

## Open

- which parts are generic: base only, or also the capability model (capability, domain, the placing rule)
- `defineType`: a type as a zod schema plus its own rules, in place of one lint for all types
- reconciliation: what wins when two packages define or extend the same thing
- where a link between packages lives: the package that owns one end, or a package above both
- how a package declares what it extends and imports, and how that maps onto its npm or git dependencies

## Starts when

- a second deployment, or a second connector that brings its own slice. With one of each, what is generic cannot be told apart from what is lotusandluna

## Done means

- the lotusandluna ontology drops its own loader and lint, and imports them from que
- a connector's slice travels with the connector, and the deployment imports it
- its check still passes
