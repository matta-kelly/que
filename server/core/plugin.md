---
type: component
description: "The plugin contract for que, in words: what a plugin is, what it gives the harness, and what it promises. Read before writing a plugin, or before changing what the harness reads from one. The code of the contract is `plugin.ts`."
status: running
---
A plugin is one concern, in one folder. It is everything an agent can get from that concern, said in a form the harness can read without knowing the domain.

- [[#What it gives the harness]] the parts, and which one is required
- [[#What it promises]] how its operations answer
- [[#What it never knows]] the line between a plugin and the harness
- [[#Capabilities and cases]] what it is for, and how that is proved

MOVING TOWARD: https://agent-plugins.org/ really should just adopt this
## What it gives the harness

- **who it is**: a name, a title, and a description that says what it is and when to use it. The only required part
- **what it needs**: a credential, if it talks to a service. Each user gives their own. A user with no credential does not get the plugin
	- `connect` turns a credential into a connection. The connection is what the operations get, never the credential
	- `whoami` says who the connection is logged in as, so "me" and "mine" mean something to the model
- **what the model can do**: operations. Each becomes a tool. What one is, and what makes a good one: [[operation]]
- **what the model can read**: skills. Each is a text with a title and a description, read when the model asks for it
- **what it is for**: capabilities. Each is an outcome someone asks for, made from its operations and skills
- a plugin carries only the parts it uses: skills only, operations only, or both
- what the definition does not list, the harness does not read

## What it promises

- each operation keeps the promises in [[operation]]: its tool card, its answers, and what a write promises

## What it never knows

- which agent uses it, or how it is shown to the model
- any agent framework. It imports only `@que/core`, `@que/ontology`, `zod` and `basis`, and the harness supplies them
- the test: if removing the folder needs a change to the harness, it was not a plugin

## Capabilities and cases

- two kinds of plugin, by what they touch. The contract does not know the kind
	- connector: one service
	- domain: across services
- an operation is shown to be right by its tests. A capability is shown to work by its cases
- a case is one behaviour of one capability, in text
	- `capability`: the capability it is about
	- `input`: what the user says
	- `start`: what is true before the run
	- `good`: one statement, true or false after the run
- cases sit beside the plugin, in `cases.ts`. No agent is given one
- a case runs against the real service. A case that changes data changes real data

## Layout

```
<name>/
├── index.ts            the definition, as the default export (definePlugin)
├── client.ts           the connection, and fakeConn: the same connection with no network, for tests
├── schema.ts           the shapes its ops read and return
├── fixtures.ts         recorded rows the op tests share, when they share any
├── ops/
│   ├── <entity>.ts       the read and write operations of one entity
│   └── <entity>.test.ts  their tests, against fakeConn
├── skills/<skill>/SKILL.md  one for each skill the definition names
├── cases.ts            the cases (defineCases), by capability
└── index.test.ts       contract checks only: validatePlugin, validateCases
```

- three kinds of proof, one home each
	- contract checks: the same for every plugin. As [[operation]] gains a rule that code can check, `validatePlugin` checks it, and every plugin gets it
	- op tests: one behaviour of one operation, named `<operation>: <behaviour>`, with no network. Each write operation has two more: the same call twice answers `unchanged`, and a value that is not allowed fails with the allowed ones
	- cases: one behaviour of one capability, with the model, against the real service
