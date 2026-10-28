---
type: component
description: "The plugin contract for que, in words: what a plugin is, which parts follow the Agent Plugins standard and which are que's own, and what a plugin promises. Read before writing a plugin, or before changing what the harness reads from one. The code of the contract is `@mku1tra/que-plugin`, in this folder."
status: running
---
A plugin is one concern, in one folder. It is everything an agent can get from that concern, said in a form the harness can read without knowing the domain. Its outer shape follows the open standard, Agent Plugins 1.0; que adds what the standard leaves to the client.

- [[#Standard]] the parts any harness reads
- [[#que's additions]] the parts only que reads, and access
- [[#What it promises]] how its operations answer
- [[#What it never knows]] the line between a plugin and the harness
- [[#Layout]] the folder, and the three kinds of proof

- [[op-contract]]: what an operation is, and what makes a good one
- `que-plugins.excalidraw`: the design in one picture: a user reaches connectors only through a domain, and the control plane reads the plugins. Not all of it is built: the control plane, and roles on cc's connectors

## Standard

Agent Plugins 1.0 ([agent-plugins.org](https://agent-plugins.org/specification)). Built: skills, found by folder; que's files in its namespace folder; and the card, `plugin.json`, written by `just card <plugin folder>` when the plugin is published. que reads a plugin from its code: its definition, `io.github.matta-kelly.que/index.ts` (`definePlugin`), its cases and its skills (`readPlugin`). Mount, the evals and `@mku1tra/que-plugin`'s source (`plugins`), which gives basis's lint each node a plugin holds, all read it so.

- what it is: a folder any harness can read
	- `plugin.json`, the card: `name` (required), and `version`, `description`, `author` and the like
		- a bridge: que writes it from the plugin's nodes at publish (`cardOf` in `@mku1tra/que-plugin`, run by `just card`), for a harness that runs no code. It is never committed, and nothing of que's reads it back: mount, the evals and the lint read the code, whatever a `plugin.json` in the folder holds
		- `name` and `description` from the plugin node, `version` from the plugin's `package.json`
		- que's part, under `extensions.io.github.matta-kelly.que`: the plugin's nodes in the plugin schema, by their real names and fields, each live value as data: `format` (3), `title`, `credential` and each op's `input` as JSON Schema, `ops` (with each op's `role`), `roles`, `usesOps`, `usesSkills`, `capabilities`, `cases`. A function is left out. Skills are not in it: their folders are the standard's
		- checked against the standard's own schema when it is written, kept in que (`plugin/standards/agent-plugins-1.0.0/`), never fetched
	- `skills/<name>/SKILL.md`: found by folder, not listed. The Agent Skills format
	- `mcp.json`: optional. que does not use it: ops run in que, with no server per plugin
	- `extensions`: data for one client, under the client's reverse-domain name
- what it leaves to the client: credentials, OAuth, permissions, and dependencies between plugins

## que's additions

What the standard leaves to the client, que defines. Its files sit in que's namespace folder, `io.github.matta-kelly.que/` (the standard puts a client's files in a folder named for its namespace); `@mku1tra/que-plugin`'s `pluginFiles` is the one place that says where each file is, the standard's and npm's too; `readPlugin` is the one way a plugin is read. Its definition, `io.github.matta-kelly.que/index.ts`, holds every que fact.

- **the contract is the plugin schema's types**: each thing in code is its node, as the type `op`, `plugin`, `access-role`, `capability` or `case` parses it: its real name, its type, and its fields, live values too (an op's `input` and `run`, a plugin's `credential`, `connect` and `whoami`). `Op`, `Plugin` and the other names in `@mku1tra/que-plugin` are the types' nodes as TypeScript types, not a second definition
	- `definePlugin` takes the plugin's fields and the nodes it holds (its ops, roles and capabilities), parses each with its type once, and gives the plugin node, which lists them by name, and each node as given. A fault throws, listing each one after its place (`ops.odoo-search title is missing`)
	- `defineCases` does the same for the cases
	- in the graph: each node is a piece of a node of the plugin schema, as code gives it (`piecesOf`), at its file and part (`index.ts#ops/odoo-search`). The plugin's skills are its folders under `skills/`, and its cases those of its `cases.ts`, so its piece lists them. A note of the same name is another piece of the same node: it gives the prose, and copies no fact of the code (basis, merge)

- **who it is**: a name, a title, and a description that says what it is and when to use it. The only required part
	- the name is lowercase letters and digits, with single hyphens between them (`fabric-to-odoo`), at most 64 characters: a name the standard takes. Each thing a plugin holds (an op, a role, a skill, a capability, a case) has its real name, unique in the whole graph: by convention it starts with the plugin's name (`odoo-find-partners`). Two things of one name, in one plugin or two, fail the mount, naming both (`basis/unique-name`)
	- each field is defined once, in the plugin schema's types: code is parsed with them, the card is written from the nodes they parse, and a note of the thing is checked with the same type
- **what the model can do**: operations. Each becomes a tool, named by the op's name, which is also its node's name, and runs in que. What one is, and what makes a good one: [[op-contract]]
	- other harnesses reach them through a remote MCP server in que (not built), not on their own
- **what the model can read**: skills, as the standard has them. Each folder under `skills/` with a `SKILL.md` is one; the definition lists none
	- read as basis reads a note (`readNote`), by `parseSkill`, which mount and the source both use. Its frontmatter: `name` (its folder's), `description`, and que's title in `metadata.title`. With no title, its name is its title. The standard's other fields are taken and not read. That frontmatter's shape (`SkillFrontmatter`) is the standard's, not a type of que's: the plugin schema names it as a bridge, so basis/one-definition passes it
	- its name is its folder's: what the model reads it by, what a domain uses it by, and its node's name. So its folder has its real name (`skills/warehouse-fabric-guide/`)
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
	- cases sit beside the definition, in `io.github.matta-kelly.que/cases.ts` (`defineCases`). No agent is given one
	- mount reads them with the definition (`readPlugin`): a case that breaks the contract fails the mount, and so does one whose capability no plugin of the deployment holds (`basis/link`)
	- a case's plugin is the one whose `cases.ts` holds it: the plugin's piece lists its cases (`cases`), and the case is about a capability that plugin lists, in any graph, a lone plugin's or a deployment's (`plugin/case-capability`; a capability that is no node is `basis/link`). The evals run it with that plugin
	- a case runs against the real service. A case that changes data changes real data
- **kind**: two kinds of plugin, by what they touch
	- connector: one service
	- domain: across services. The contract knows one by its `usesOps` and `usesSkills`
- a plugin carries only the parts it uses: skills only, operations only, or both
- what the definition does not list, the harness does not read, but for skills: each folder under `skills/` is one

### Credentials / Access

Built: roles and a domain's list, declared and checked. Designed, not built: a domain op calling what it uses, and what each user gets each chat.

- connector, third party (odoo): the user's own login. No roles in que: the service enforces its own
- connector, internal (warehouse, dagster): can list its `roles`, each a name and a description, and then each op names its `role`. Neither lists roles now
	- the check: a plugin with roles gives every op one it lists; a plugin with none gives none. Each fault is reported once: an op with no role, in a plugin that lists roles, and an op whose role is another plugin's, by `plugin/op-role` (`warehouse-search names no role`); a role that is no node, by `basis/link`
- domain: lists what it uses from connectors, each op and skill by its name, in two links: `usesOps` to ops and `usesSkills` to skills (`usesOps: ["warehouse-get-fabric"], usesSkills: ["warehouse-fabric-guide"]`)
	- the check: each name is an op, or a skill, of a plugin that uses nothing (`plugin/connector-use`), so there are no chains and no cycles; a plugin uses none of its own (`plugin/own-use`), as its own are its already
- one definition: the plugin schema gives basis its package's exports (`exports`), and a folder's lint (lot's, que's check, `que-harness lint`) fails each zod object exported that is no part of a type nor a bridge it names, and each bridge that excuses nothing (`basis/one-definition`)
- the one check (`checkPlugins`): each node the code and skills give, as pieces, linted by basis with the plugin schema, as lot's lint lints them, and each problem said as the lint says it
	- mount of one plugin (`just check-plugin`): with its skills and cases. What it uses is there, and not read. Each case's capability resolves against the plugin's own, so a case about a capability its plugin does not hold fails (`basis/link`)
	- mount of a deployment: all its plugins, and nothing unread. A name a plugin uses that the deployment does not give is a problem
- who holds which domains, roles and logins, and what a user gets each chat: que's control plane (not built), not the plugin

## What it promises

- each operation keeps the promises in [[op-contract]]: its tool card, its answers, and what a write promises

## What it never knows

- which agent uses it, or how it is shown to the model
- any agent framework. From que a plugin imports only `@mku1tra/que-plugin`, `zod` and `@mku1tra/basis`; `@mku1tra/que-harness` is a deployment's, for its definition and its configs. The runtime supplies each of them to a folder outside que: by those exact names they resolve to que's copy, even when the folder installs its own. A subpath, such as `zod/v4`, is not supplied
- what else it needs, it brings itself: a library such as a database driver is a dependency in its own `package.json`, and the deployment installs it. A library it brings also gets que's copy of the supplied names, so it must work with que's versions of them
- the test: if removing the folder needs a change to the harness, it was not a plugin

## Layout

```
<name>/
├── plugin.json                   the card, written by `just card` at publish, never committed
├── skills/<skill>/SKILL.md       one skill each, found by folder (the standard's)
├── package.json                  npm: its dependencies, and the @mku1tra/que-plugin it works with
└── io.github.matta-kelly.que/    que's files
    ├── index.ts                  the definition, as the default export (definePlugin)
    ├── client.ts                 the connection, and fakeConn: the same connection with no network, for tests
    ├── schema.ts                 the shapes its ops read and return
    ├── fixtures.ts               recorded rows the op tests share, when they share any
    ├── ops/
    │   ├── <entity>.ts           the read and write operations of one entity
    │   └── <entity>.test.ts      their tests, against fakeConn
    └── cases.ts                  the cases (defineCases), by capability
```

- a definition at the plugin's root fails the mount, saying que's files moved into the namespace folder

- three kinds of proof, one home each
	- contract checks: the same for every plugin, and none written by it. `definePlugin` and `defineCases` parse with the types when the code is imported, and `just check-plugin` lints the plugin with the schema's rules. As [[op-contract]] gains a rule that code can check, the plugin schema holds it (a field of a type, or a rule), and every plugin gets it
	- op tests: one behaviour of one operation, named `<operation>: <behaviour>`, with no network. Each write operation has two more: the same call twice answers `unchanged`, and a value that is not allowed fails with the allowed ones
	- cases: one behaviour of one capability, with the model, against the real service
