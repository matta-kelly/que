---
type: component
description: "The plugin contract for que, in words: what a plugin is, which parts follow the Agent Plugins standard and which are que's own, and what a plugin promises. Read before writing a plugin, or before changing what the harness reads from one. The code of the contract is `plugin.ts`."
status: running
---
A plugin is one concern, in one folder. It is everything an agent can get from that concern, said in a form the harness can read without knowing the domain. Its outer shape follows the open standard, Agent Plugins 1.0; que adds what the standard leaves to the client.

- [[#Standard]] the parts any harness reads
- [[#que's additions]] the parts only que reads, and access
- [[#What it promises]] how its operations answer
- [[#What it never knows]] the line between a plugin and the harness
- [[#Layout]] the folder, and the three kinds of proof

- [[operation]]: what an operation is, and what makes a good one

## Standard

Agent Plugins 1.0 ([agent-plugins.org](https://agent-plugins.org/specification)). Built: skills, found by folder, and que's files in its namespace folder. Not built: `plugin.json`; que reads its definition from `io.github.matta-kelly.que/index.ts` (`definePlugin`).

- what it is: a folder any harness can read
	- `plugin.json`: `name` (required), and `version`, `description`, `author` and the like
	- `skills/<name>/SKILL.md`: found by folder, not listed. The Agent Skills format
	- `mcp.json`: optional. que does not use it: ops run in que, with no server per plugin
	- `extensions`: data for one client, under the client's reverse-domain name
- what it leaves to the client: credentials, OAuth, permissions, and dependencies between plugins

## que's additions

What the standard leaves to the client, que defines. Its files sit in que's namespace folder, `io.github.matta-kelly.que/` (the standard puts a client's files in a folder named for its namespace); `@que/core`'s `pluginFiles` is the one place that says where each one is. Its definition, `io.github.matta-kelly.que/index.ts`, holds every que fact.

- **who it is**: a name, a title, and a description that says what it is and when to use it. The only required part
	- the name is lowercase letters and digits, with single hyphens between them (`fabric-to-odoo`), at most 64 characters: a name the standard takes, and the start of each tool name
- **what the model can do**: operations. Each becomes a tool, and runs in que. What one is, and what makes a good one: [[operation]]
	- other harnesses reach them through a remote MCP server in que (not built), not on their own
- **what the model can read**: skills, as the standard has them. Each folder under `skills/` with a `SKILL.md` is one; the definition lists none
	- its frontmatter: `name` (its folder's), `description`, and que's title in `metadata.title`. With no title, its name is its title. The standard's other fields are taken and not read
	- a skill that breaks this fails the mount: que is stricter than the standard, which skips it, so a plugin never loads half its skills
- **what it needs**: a credential, if it talks to a service. Each user gives their own. A user with no credential does not get the plugin
	- `connect` turns a credential into a connection. The connection is what the operations get, never the credential
	- `whoami` says who the connection is logged in as, so "me" and "mine" mean something to the model
- **what it is for**: capabilities. Each is an outcome someone asks for, made from its operations and skills
	- an operation is shown to be right by its tests. A capability is shown to work by its cases
	- a case is one behaviour of one capability, in text
		- `capability`: the capability it is about
		- `input`: what the user says
		- `start`: what is true before the run
		- `good`: one statement, true or false after the run
	- cases sit beside the definition, in `io.github.matta-kelly.que/cases.ts`. No agent is given one
	- a case runs against the real service. A case that changes data changes real data
- **kind**: two kinds of plugin, by what they touch
	- connector: one service
	- domain: across services. The contract knows one by its `uses`
- a plugin carries only the parts it uses: skills only, operations only, or both
- what the definition does not list, the harness does not read

### Credentials / Access

Built: roles and a domain's list, declared and checked. Designed, not built: a domain op calling what it uses, and what each user gets each run.

- connector, third party (odoo): the user's own login. No roles in que: the service enforces its own
- connector, internal (warehouse, dagster): lists its `roles`, each a name and a description, and each op names its `role` (warehouse `read`, `write`)
	- the check: a plugin with roles gives every op one it lists; a plugin with none gives none
- domain: lists what it uses from connectors in `uses`: ops by tool name, skills by id (`uses: { ops: ["warehouse_getFabric"], skills: ["warehouse/fabric-guide"] }`)
	- the check, at mount: each name is an op or skill of a connector the deployment mounts. A domain's op or skill cannot be used, so there are no chains and no cycles; a plugin's own are its already
- who holds which domains, roles and logins, and what a user gets each run: que's control plane (not built), not the plugin

## What it promises

- each operation keeps the promises in [[operation]]: its tool card, its answers, and what a write promises

## What it never knows

- which agent uses it, or how it is shown to the model
- any agent framework. From que it imports only `@que/core`, `@que/ontology`, `zod` and `@mku1tra/basis`, and the harness supplies them: by those exact names, and any subpath of `@que/core`, they resolve to que's copy, even when the plugin installs its own. Another subpath, such as `zod/v4`, is not supplied
- what else it needs, it brings itself: a library such as a database driver is a dependency in its own `package.json`, and the deployment installs it. A library it brings also gets que's copy of the supplied names, so it must work with que's versions of them
- the test: if removing the folder needs a change to the harness, it was not a plugin

## Layout

```
<name>/
├── plugin.json                   the standard manifest (not built)
├── skills/<skill>/SKILL.md       one skill each, found by folder (the standard's)
├── package.json                  npm: its dependencies, and the @que/core it works with
└── io.github.matta-kelly.que/    que's files
    ├── index.ts                  the definition, as the default export (definePlugin)
    ├── client.ts                 the connection, and fakeConn: the same connection with no network, for tests
    ├── schema.ts                 the shapes its ops read and return
    ├── fixtures.ts               recorded rows the op tests share, when they share any
    ├── ops/
    │   ├── <entity>.ts           the read and write operations of one entity
    │   └── <entity>.test.ts      their tests, against fakeConn
    ├── cases.ts                  the cases (defineCases), by capability
    └── index.test.ts             contract checks only: validatePlugin, validateCases
```

- a definition at the plugin's root fails the mount, saying que's files moved into the namespace folder

- three kinds of proof, one home each
	- contract checks: the same for every plugin. As [[operation]] gains a rule that code can check, `validatePlugin` checks it, and every plugin gets it
	- op tests: one behaviour of one operation, named `<operation>: <behaviour>`, with no network. Each write operation has two more: the same call twice answers `unchanged`, and a value that is not allowed fails with the allowed ones
	- cases: one behaviour of one capability, with the model, against the real service
