---
type: component
description: "What an operation is in que, its two kinds, what it runs with and what it uses, and what makes a good one: its tool card, how it answers, and what a write promises. Read before writing or reviewing an operation. The code is `Op` in `@mku1tra/que-plugin`."
status: running
---
op: a function of a plugin that que gives the model as one tool, and runs for one user.
- [[#Kinds]] a connector op and a domain op
- [[#Context]] what an op runs with
- [[#Uses]] what an op calls, said in its definition
- [[#Tool card]] what the model reads before it calls
- [[#Input]] what it takes
- [[#Answer]] what comes back
- [[#Writes]] what an operation that changes data promises

- [[plugin-contract]]: the contract an operation is part of
- the plugin-interoperability design, in kinetic: the design of the domain op, its context and uses. Not built: [[#Kinds]], [[#Context]] and [[#Uses]] say what is

## Kinds

The kind of an op is the kind of its plugin. The plugin says its kind (`kind`), and is a connector when it leaves it out ([[plugin-contract]])

- connector op: one action on its plugin's service, with its plugin's connection. It stands alone: it calls no other op. Built
- domain op: a fixed procedure across services. It calls the connector ops it lists, through que, and has no connection of its own. Use one where the order of the steps must not depend on the model, as a write in more than one service. Where the model must judge, a skill guides it through the connector ops instead. Built in the contract: its context and its uses, typed and checked. Not built: que does not run one as a domain op yet ([[#Context]])

## Context

What `run(ctx, params)` gets as `ctx`.

- connector op: `{ conn }`, the connection to its service, logged in for the user. Built
- domain op: `{ ops }`, one function for each op it lists, by the op's name. Each one runs that op through que, with that op's login for the user. The domain op never sees a login
	- built in the contract: `Op`'s context follows its third argument, its plugin's kind (`Op<Conn, S, "domain">`), and `definePlugin` gives each op it holds the context of its `kind`, a connector when left out. A domain op's run that reads `ctx.conn` does not compile, nor a connector op's that reads `ctx.ops`
	- not built: the runtime gives every op `{ conn }`, and no `ops`
- `params` is the input, parsed with the op's `input`

## Uses

- an op lists the ops it calls in its `uses`: a link to ops, so a name that is no op fails (`basis/link`). Built
- a domain op lists only connector ops: a name its `uses` lists that is a domain's op fails (`plugin/op-uses`). Built. It can call only those: not built, as que does not run a domain op yet
- a connector op lists nothing: it stands alone. A connector's op that lists anything fails (`plugin/op-uses`). Built
- a skill lists the ops it uses in its frontmatter, in the Agent Skills field `allowed-tools`, space-separated: its `uses`, a link to ops, so a name that is no op fails (`basis/link`). Built. A domain's skill lists no op of its own (`plugin/own-use`) and no domain's op, and a connector's skill lists only its own ops (`plugin/connector-use`). Built
- the plugin's `usesOps` is made from its ops' and skills' lists, each name once and none of its own ops, and never written: `readPlugin` makes it, and a plugin whose code gives one fails. Built. The card writes it, and each op's `uses`

## Tool card

The model knows only what the card says, so the card is the whole interface.

- `name`: the plugin's name, then a verb and its object, lowercase words with hyphens between them (`odoo-get-company`, `odoo-find-partners`). It is the tool's name and the op's node's name, unique in the graph
- `title`: a few words, for people
- `description`
	- when to use it
	- which operation to use in its place (`To search by name, use odoo-find-partners instead`)
	- what it returns
	- its limits: caps, and what it does not cover

## Input

- `input` is a zod object, every field is described, and a model API can take it as JSON Schema: the op type holds each of these
- a field with a few allowed values is an enum, not free text
- a value that is not allowed fails with the list of allowed ones, so the next call can be right
- the boundary: the runtime's door owns the input, for every caller
	- the door is the one parse: run gets the parsed value, with its defaults and transforms in
	- a failed parse is an `OpFailed` on one line, with the path and the message of each issue, never zod's own error. A refine's message is what the model reads, so it says what is allowed
	- a refine or a transform that throws (`JSON.parse` on `{`) is a failed parse too: an `OpFailed` with the throw's message
	- extra arguments are refused: the door parses the input as strict, and an extra field is an `OpFailed` that names it. This holds for an input made with zod or with zod/mini
	- inside a nested object, zod's own rule holds: `z.object` strips an extra field, and `z.strictObject` refuses it. The shown schema says the same
	- the model is shown the input side of `input` as JSON Schema (zod's `io: "input"`): a transform shows what goes in, a field with a default is not required, and no other field is allowed. What JSON Schema cannot say (a refine, a transform's own check) only the door checks

## Answer

- nothing found is a normal answer, not a failure. It says what was looked for, and where to look instead (`Odoo id 12 is not a company: it's a buyer of Acme; call odoo-get-company with id 7`)
- a list is capped. When more match, the answer says how to get the next page
- a real failure is one kind of error, `OpFailed`, with a message that says which failure it was (timeout, unreachable, refused, the service's own error), so the model can tell the user what to do. Any other error is a bug in the plugin
- every call to a service has a time limit

## Writes

- the same call twice gives the same result: it finds the record by its key and creates or updates it. Never a blind create
- the answer says what it did: created, updated or unchanged, with the record's id. The model does not have to read again to check
- the description says what it changes
