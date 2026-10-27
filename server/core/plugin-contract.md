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
- `que-plugins.excalidraw`: the design in one picture: a user reaches connectors only through a domain, and the control plane reads the cards. Not all of it is built: the control plane, and roles on cc's connectors

## Standard

Agent Plugins 1.0 ([agent-plugins.org](https://agent-plugins.org/specification)). Built: skills, found by folder; que's files in its namespace folder; and the card, `plugin.json`, made by `just card <plugin folder>` and required. A reader of cards that runs no code: `@que/ontology`'s source, which gives basis's lint each node a plugin holds; que's control plane (not built) is another. que reads its definition from `io.github.matta-kelly.que/index.ts` (`definePlugin`).

- what it is: a folder any harness can read
	- `plugin.json`, the card: `name` (required), and `version`, `description`, `author` and the like
		- que makes it from the definition and the cases, never by hand (`cardOf` in `@que/core`): `name` and `description` from the definition, `version` from the plugin's `package.json`
		- que's part, under `extensions.io.github.matta-kelly.que`: the plugin's nodes in que's ontology, by its field names, each thing by its name in the plugin: `format` (2), `title`, `credential` and each op's `input` as JSON Schema, `ops` (with each op's `role`), `roles`, `uses`, `capabilities`, `cases`. Skills are not in it: their folders are the standard's
		- checked against the standard's own schema, kept in que (`core/standards/agent-plugins-1.0.0/`), never fetched, and against que's part (`CardPart`)
		- required: mount, the evals and `just check-plugin` fail on a plugin with no card, or one that is not, byte for byte, what its definition and its cases make, naming the first line that differs. The fix is always `just card`
		- in the graph: each node a plugin holds is a piece of a node of que's ontology, read from the card. A thing a plugin names in itself (an op, a role, a skill) is the node `<plugin>-<name>`; a capability and a case keep their names. A note of the same name is another piece of the same node: it gives the prose, and copies no fact of the code (basis, merge)
		- no formatter touches it (`.prettierignore`): the card check holds its bytes
	- `skills/<name>/SKILL.md`: found by folder, not listed. The Agent Skills format
	- `mcp.json`: optional. que does not use it: ops run in que, with no server per plugin
	- `extensions`: data for one client, under the client's reverse-domain name
- what it leaves to the client: credentials, OAuth, permissions, and dependencies between plugins

## que's additions

What the standard leaves to the client, que defines. Its files sit in que's namespace folder, `io.github.matta-kelly.que/` (the standard puts a client's files in a folder named for its namespace); `@que/core`'s `pluginFiles` is the one place that says where each file is, the standard's and npm's too; `readDefinition` is the one way a plugin is read. Its definition, `io.github.matta-kelly.que/index.ts`, holds every que fact.

- **who it is**: a name, a title, and a description that says what it is and when to use it. The only required part
	- the name is lowercase letters and digits, with single hyphens between them (`fabric-to-odoo`), at most 64 characters: a name the standard takes, and the start of each tool name. So two plugins can give one name (odoo's `find-partners`, odoo-find's `partners`): mount refuses a deployment where they do, naming both
	- each field is defined once, in `@que/ontology`'s types: `@que/core`'s specs are built from them, and a note of the thing is checked with the same type
- **what the model can do**: operations. Each becomes a tool, named `<plugin>-<op>`, which is also its node's name, and runs in que. What one is, and what makes a good one: [[operation]]
	- other harnesses reach them through a remote MCP server in que (not built), not on their own
- **what the model can read**: skills, as the standard has them. Each folder under `skills/` with a `SKILL.md` is one; the definition lists none
	- its frontmatter: `name` (its folder's), `description`, and que's title in `metadata.title`. With no title, its name is its title. The standard's other fields are taken and not read
	- its id is `<plugin>-<name>`: what the model reads it by, what a domain uses it by, and its node's name
	- a skill that breaks this fails the mount, and so does a folder under `skills/` with no `SKILL.md`: que is stricter than the standard, which skips both, so a plugin never loads half its skills, and a misnamed `SKILL.md` is never dropped unseen
- **what it needs**: a credential, if it talks to a service. Each user gives their own. A user with no credential does not get the plugin
	- `connect` turns a credential into a connection. The connection is what the operations get, never the credential
	- `whoami` says who the connection is logged in as, so "me" and "mine" mean something to the model
- **what it is for**: capabilities. Each is an outcome someone asks for, made from its operations and skills
	- an operation is shown to be right by its tests. A capability is shown to work by its cases
	- a case is one behaviour of one capability, in text
		- `name`: unique in the graph
		- `description`: the behaviour it shows, in one line
		- `capability`: the capability it is about
		- `input`: what the user says
		- `start`: what is true before the run
		- `good`: one statement, true or false after the run
	- cases sit beside the definition, in `io.github.matta-kelly.que/cases.ts`, and are on the card. No agent is given one
	- mount reads them with the definition (`readDefinition`), as the card is made from both: a case that breaks the contract fails the mount
	- a case runs against the real service. A case that changes data changes real data
- **kind**: two kinds of plugin, by what they touch
	- connector: one service
	- domain: across services. The contract knows one by its `uses`
- a plugin carries only the parts it uses: skills only, operations only, or both
- what the definition does not list, the harness does not read, but for skills: each folder under `skills/` is one

### Credentials / Access

Built: roles and a domain's list, declared and checked. Designed, not built: a domain op calling what it uses, and what each user gets each run.

- connector, third party (odoo): the user's own login. No roles in que: the service enforces its own
- connector, internal (warehouse, dagster): can list its `roles`, each a name and a description, and then each op names its `role`. Neither lists roles now
	- the check: a plugin with roles gives every op one it lists; a plugin with none gives none. A rule of que's ontology (`plugin/op-role`), so the lint holds a card to it as `validatePlugin` holds a definition
- domain: lists what it uses from connectors in `uses`, each op and skill by its name in the graph (`uses: { ops: ["warehouse-get-fabric"], skills: ["warehouse-fabric-guide"] }`)
	- the check, at mount: each name is an op or skill of a connector the deployment mounts, found by its name, not split. A plugin that names its own is refused when it mounts on its own, and by the lint (`plugin/own-use`) A domain's op or skill cannot be used, so there are no chains and no cycles; a plugin's own are its already
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
├── plugin.json                   the card, made by `just card` from the definition
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
