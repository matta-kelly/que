---
type: component
description: "What an operation is in que, its two kinds, what it runs with and what it uses, and what makes a good one: its tool card, how it answers, and what a write promises. Read before writing or reviewing an operation. The code is `Op` in `@mku1tra/que-plugin`."
status: running
---
op: a function of a plugin that que gives the model as one tool, and runs for one user.
- [[#A good op]] what it is judged by
- [[#Kinds]] a connector op and a domain op
- [[#Context]] what an op runs with
- [[#Uses]] what an op calls, said in its definition
- [[#Tool card]] what the model reads before it calls
- [[#Input]] what it takes
- [[#Answer]] what comes back
- [[#Writes]] what an operation that changes data promises
- [[#Approval]] whether the door asks for a yes before it runs

- [[plugin-contract]]: the contract an operation is part of
- the plugin-interoperability design, in kinetic: the design of the domain op, its context and uses. Built: [[#Kinds]], [[#Context]] and [[#Uses]] say what is

## A good op

A good op does one job, cannot be called wrong, and says truly what happened.

- one job: a verb and its object. Another job is another op
- it holds what must be true whatever the model does ([[skill-contract#Skill or op]])
	- a value that is not allowed is not offered: an enum, not free text
	- an action that must never happen has no op
	- a field that must never be written is not in its input
	- a value it can work out, such as the logged-in user or today's date, it sets itself
- it reads only its input and its connection: nothing from around it
- an op that changes data says whether it needs a yes from the user: `approval` on its node ([[#Approval]])
- a rule that decides a number or a record lives in one op, and other ops and skills use that op
- each of its behaviours has a test ([[plugin-contract#Layout]])

## Kinds

The kind of an op is the kind of its plugin. The plugin says its kind (`kind`), and is a connector when it leaves it out ([[plugin-contract]])

- connector op: one action on its plugin's service, with its plugin's connection. It stands alone: it calls no other op. Built
- domain op: a fixed procedure across services. It calls the connector ops it lists, through que, and has no connection of its own. Use one where the order of the steps must not depend on the model, as a write in more than one service. Where the model must judge, a skill guides it through the connector ops instead. Built: its context and its uses, typed and checked, and que runs it as a domain op ([[#Context]])

## Context

What `run(ctx, params)` gets as `ctx`.

- connector op: `{ conn, files }`, the connection to its service, logged in for the user, and the run thread's files. Built
- domain op: `{ ops, files }`, one function for each op it lists, by the op's name, and the run thread's files. Each one runs that op through que, with its connector's login for the calling user. The domain op never sees a login
	- built in the contract: `Op`'s context follows its third argument, its plugin's kind (`Op<Conn, S, "domain">`), and `definePlugin` gives each op it holds the context of its `kind`, a connector when left out. A domain op's run that reads `ctx.conn` does not compile, nor a connector op's that reads `ctx.ops`
	- built in the runtime: the door gives a domain op `{ ops, files }`, each found among every mounted op, and a connector op `{ conn, files }`
- files: the run thread's attachments, for both kinds of op. `files.get(id)` gives `{ id, name, mimeType, size, bytes }`, and `files.list()` gives each file's metadata, without its bytes. A plugin gets bytes, never the store's path
	- the scope is the run's thread: a file id of another thread is an `OpFailed` that names the id and the thread. Built: the door resolves the id through the store's thread, and gives a domain op's listed calls the same scope
- `params` is the input, parsed with the op's `input`

## Uses

- an op lists the ops it calls in its `uses`: a link to ops, so a name that is no op fails (`basis/link`). Built
- a domain op lists only connector ops: a name its `uses` lists that is a domain's op fails (`plugin/op-uses`). Built. It can call only those: its `ops` holds only them. Built
- a connector op lists nothing: it stands alone. A connector's op that lists anything fails (`plugin/op-uses`). Built
- a skill lists the ops it uses in its frontmatter, in the Agent Skills field `allowed-tools`, space-separated: its `uses`, a link to ops, so a name that is no op fails (`basis/link`). A domain's skill lists no op of its own (`plugin/own-use`) and no domain's op, and a connector's skill lists only its own ops (`plugin/connector-use`). Built
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
- a gap is said, never hidden: a missing record is not a zero, and a blank in the service is not a value
- a list is capped. When more match, the answer says how to get the next page
- a real failure is one kind of error, `OpFailed`, with a message that says which failure it was (timeout, unreachable, refused, the service's own error), so the model can tell a wrong call, which it fixes, from a refusal, which it tells the user. When a service refuses for a missing right, the message names the right to ask for: that is the plugin's to know. Any other error is a bug in the plugin
- every call to a service has a time limit

## Writes

- the same call twice gives the same result: it finds the record by its key and creates or updates it. Never a blind create
- the answer says what it did: created, updated or unchanged, with the record's id. The model does not have to read again to check
- the description says what it changes
- success means the service's answer shows the new value, not only that the request returned. Where the service's reads lag its writes, the op trusts the write's answer and does not read back
- an op over many records does not stop at one bad record: the answer gives the result of each, so a re-run shows what is settled and what is not

## Approval

- the op declares, the door asks: `approval` on its node. `true` asks with the default text and decisions; an object gives a `description` (a fixed string, or a function of the parsed input), an optional `when` (a function of the parsed input), and the `decisions` it allows (default approve, edit and reject). The object form needs its description
- the door holds the gate after it parses the input and before it makes the connection or a domain op's listed calls, so the user approves what will run. A `when` that answers false for the parsed input skips the ask and runs the op
- the ask gets one request: the op's name, its parsed input, the tool call's id, the description, and the allowed decisions. A run with no way to ask refuses the call
- the four decisions, and what each does
	- approve: the call runs
	- reject: the call does not run, and an optional message goes to the model; the door throws an `OpFailed` that says the user declined and the call did not run
	- edit: the new args are parsed with the same strict parse, and the call runs with them
	- respond: the call does not run, and the message is the call's result text, as a `Responded` the chat's extension reads. It is never the way to deny an op that changes data
- a decision the op does not allow is a reject that says so
- que's web run asks: the stream ends on an AG-UI `tool_call` interrupt on that call, with one branch of its `responseSchema` per decision the op allows; the card shows the op and its input with a control for each decision, and the answer, LangChain's per-call payload, resumes the run, which runs the op or refuses it (`server/runtime/src/run/runs.ts`)
- que's MCP server refuses: over MCP an op that needs approval is listed, its tool's description says it cannot be approved over MCP, and every call is refused with that reason. The refusal is an `OpFailed` that names the op, says it needs approval, that it cannot be approved over MCP, and that the call did not run, and names no other place to approve. No client is asked, on either protocol era or either mouth, and an answer or a `requestState` a client brings changes nothing
- edit and respond are the web run's alone: over MCP an op that needs approval never runs, so an op that needs a new input, or a message as its result, runs from the web UI
- a flagged op's tool says `annotations.destructiveHint: true`. It is a hint: clients treat annotations as untrusted, so it never replaces the refusal, and the door still refuses the call
- a refusal is an `OpFailed` that says the call did not run, so the model gets it as the tool result and the run goes on
- only the call the model makes is asked. A domain op's listed calls run without one
