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
- [[#Invariants]] what the plugin schema holds true of every graph, that basis leaves to it, each with the rule or construction that holds it

- [[op-contract]]: what an operation is, and what makes a good one
- [[skill-contract]]: what goes in a skill and not an operation, and what makes a good one
- `que-plugins.excalidraw`: the design in one picture: a user reaches connectors only through a domain, and the control plane reads the plugins. Not all of it is built: the control plane, a user reaching connectors only through a domain (today the catalog gives a user each connector they can use), and roles on cc's connectors

## Standard

Agent Plugins 1.0 ([agent-plugins.org](https://agent-plugins.org/specification)). Built: skills, found by folder; que's files in its namespace folder; and the card, `plugin.json`, written by `just card <plugin folder>` when the plugin is published. que reads a plugin from its code: its definition, `io.github.matta-kelly.que/index.ts` (`definePlugin`), its cases and its skills (`readPlugin`). Mount, the evals and `@mku1tra/que-plugin`'s source (`plugins`), which gives basis's lint each node a plugin holds, all read it so.

- what it is: a folder any harness can read
	- `plugin.json`, the card: `name` (required), and `version`, `description`, `author` and the like
		- a bridge: que writes it from the plugin's nodes at publish (`cardOf` in `@mku1tra/que-plugin`, run by `just card`), for a harness that runs no code. It is never committed, and que reads it back only in memory, from the cards mount makes for the control plane: mount, the evals and the lint read the code, whatever a `plugin.json` in the folder holds
		- `name` and `description` from the plugin node, `version` from the plugin's `package.json`
		- que's part, under `extensions.io.github.matta-kelly.que`: the plugin's nodes in the plugin schema, by their real names and fields, each live value as data: `format` (6), `title`, `kind` (`connector` when the plugin leaves it out), `credential` and each op's `input` as JSON Schema, `ops` (with each op's `role` and `uses`), `skills` (a connector's, each by name with its `uses`; a domain's are not), `roles`, `usesOps` (made from its ops' and skills' `uses`), `usesSkills`, `capabilities`, `cases`. A function is left out. A skill's folder is the standard's; que's part says which ops each of a connector's skills uses
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
	- each node they give is a definition: marked with its name and type by basis's `markDefinition`. What holds the nodes (the definition, the list of cases) is no node, and has no mark
	- in the graph: each node is a piece of a node of the plugin schema, as code gives it (`piecesOf`), at its file and part (`index.ts#ops/odoo-search`). The plugin's skills are its folders under `skills/`, and its cases those of its `cases.ts`, so its piece lists them. A note of the same name is another piece of the same node: it gives the prose, and copies no fact of the code (basis, merge)

- **who it is**: a name, a title, and a description that says what it is and when to use it. The only required part
	- the name is lowercase letters and digits, with single hyphens between them (`fabric-to-odoo`), at most 64 characters: a name the standard takes. Each thing a plugin holds (an op, a role, a skill, a capability, a case) has its real name, unique in the whole graph: by convention it starts with the plugin's name (`odoo-find-partners`). Two things of one name, in one plugin or two, fail the mount, naming both (`basis/unique-name`)
	- each field is defined once, in the plugin schema's types: code is parsed with them, the card is written from the nodes they parse, and a note of the thing is checked with the same type
- **what the model can do**: operations. Each becomes a tool, named by the op's name, which is also its node's name, and runs in que. What one is, and what makes a good one: [[op-contract]]
	- other harnesses reach them through a remote MCP server in que (not built), not on their own
- **what the model can read**: skills, as the standard has them. Each folder under `skills/` with a `SKILL.md` is one; the definition lists none
	- read as basis reads a note (`readNote`), by `parseSkill`, which mount and the source both use. Its frontmatter: `name` (its folder's), `description`, que's title in `metadata.title`, and the ops it uses in `allowed-tools`, space-separated, as its `uses`. With no title, its name is its title. With no `allowed-tools`, it has no uses. The standard's other fields are taken and not read. That frontmatter's shape (`SkillFrontmatter`) is the standard's, not a type of que's: the plugin schema names it as a bridge, so basis/one-definition passes it
	- its name is its folder's: what the model reads it by, what a domain uses it by, and its node's name. So its folder has its real name (`skills/warehouse-fabric-guide/`)
	- a skill that breaks this fails the mount, and so does a folder under `skills/` with no `SKILL.md`: que is stricter than the standard, which skips both, so a plugin never loads half its skills, and a misnamed `SKILL.md` is never dropped unseen
- **what it needs**: a credential, if it is a connector that talks to a service. Each user gives their own. A user with no credential does not get the connector. A domain gives none
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
- **kind**: two kinds of plugin, by what they touch. The plugin says its kind (`kind`: `"connector"` or `"domain"`), and is a connector when it leaves it out. The card says it too
	- connector: one service. It holds what the service needs: the credential, the roles, the logins, and the failure that says what is missing. Each of its ops stands alone: an op of a connector that lists anything in its `uses` fails (`plugin/op-uses`, [[op-contract#Uses]])
	- domain: across services. What it uses, it uses through the connectors
		- the check: a domain gives no `credential`, no `connect`, no `whoami` and no `roles`, each field said (`plugin/domain-connection`); a plugin that lists the skills it uses (`usesSkills`) and does not say `kind: "domain"` fails, as a domain says its kind (`plugin/domain-uses`)
		- a user who has a domain has all of it, and a call it makes to a connector the user cannot use fails at that connector, with an `OpFailed` that names it. Every user has every domain: grants are not built (the que-control-plane issue, in kinetic)
- a plugin carries only the parts it uses: skills only, operations only, or both
- what the definition does not list, the harness does not read, but for skills: each folder under `skills/` is one

### Credentials / Access

Built: the kind, roles, a domain's list of skills, each skill's list and each op's list, declared and checked, the plugin's `usesOps` made from the last two, and an op's context typed by its kind. Built too: a domain op calls what it uses, through the door, and each user gets, each chat, every domain and each connector they can use. Not built: grants of domains, and a login per role (the que-control-plane issue, in kinetic).

- connector, third party (odoo): the user's own login. No roles in que: the service enforces its own
- connector, internal (warehouse, dagster): can list its `roles`, each a name and a description, and then each op names its `role`. Neither lists roles now. A login per role is not built: one credential per user serves every role of a connector
	- the check: a plugin with roles gives every op one it lists; a plugin with none gives none. Each fault is reported once: an op with no role, in a plugin that lists roles, and an op whose role is another plugin's, by `plugin/op-role` (`warehouse-search names no role`); a role that is no node, by `basis/link`
- domain (`kind: "domain"`): uses connectors' ops and skills, each by its name. Its ops and skills list the ops they use, and the plugin lists the skills it uses in `usesSkills` (`usesSkills: ["warehouse-fabric-guide"]`)
	- each op lists the ops it calls, as its `uses`: a name that is no op fails (`basis/link`); a domain's op lists only connectors' ops, and a connector's op lists none (`plugin/op-uses`)
	- each skill lists the ops it uses in its frontmatter (`allowed-tools`), as its `uses`: a name that is no op fails (`basis/link`); a connector's skill lists only its own ops (`plugin/connector-use`)
	- the check, of `usesSkills` and of each skill's `uses`: each name is a connector's op or skill (`plugin/connector-use`), so there are no chains and no cycles; a domain uses none of its own (`plugin/own-use`), as its own are its already
	- the plugin's `usesOps` is made from its ops' and skills' `uses`, each name once and none of its own ops, and never written: `readPlugin` makes it, and a plugin whose code gives one fails ([[op-contract#Uses]]). The source and the card read it. A name in it that no plugin under the root gives is the deployment's to give, so a plugin linted alone takes it
- one definition: the plugin schema gives basis its package's exports (`exports`), and a root's lint (lot's, que's check, `basis lint` of a deployment's root) fails each zod object exported that is no part of a type nor a bridge it names, and each bridge that excuses nothing (`basis/one-definition`)
- each definition is a piece: a root's lint fails each definition that a schema's exports give, at any depth, of which no source gives a piece of its name and type (`basis/definition-piece`). A package that exports its plugins' definitions, as a deployment's repo can, lints with a source that reads them (`plugins`, or the harness's `deploymentSources`). The plugin schema's own exports hold no definition
- the check is a root's lint: each node the code and skills give, as pieces, linted by basis with the plugin schema from a root, as lot's lint lints them, and each problem said as the lint says it (`sayProblem`). A lint starts only at a root, the first folder up from the plugin with a `basis.config.ts` (basis's `rootOf`)
	- mount of one plugin (`just check-plugin`, and the card's writer): the lint of its root, with its skills and cases. A plugin that is its own root gives its config `pluginSchema`, whose source is the plugins in its folder (`plugins`): what a plugin uses that none of them gives is there, and not read. Each case's capability resolves against the plugin's own, so a case about a capability its plugin does not hold fails (`basis/link`). A plugin in no root, or in one that does not give it, fails
	- mount of a deployment: the lint of the deployment's root, with all its plugins, and nothing unread. A name a plugin uses that the deployment does not give is a problem
- who holds which domains, roles and logins, and what a user gets each chat: que's control plane, not the plugin. Built today: a login per user and connector, and access's catalog. Not built: grants of domains, and a login per role (the que-control-plane issue, in kinetic)

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

## Invariants

basis leaves two invariants to the schema that states a relation or writes a bridge ([[basis#Validation]]). Under each is the rule or the construction that holds it, or "no rule yet" with the reason. A gap is a blind spot of the holder above it.

- a relation is stated once: one link, on one node, and its reverse comes from the graph
	- a plugin holds its ops, roles, capabilities, skills and cases: the plugin node lists them, and none of them names its plugin
		- each is held by one plugin: two plugins that hold one name give two pieces of one name from one source
			- rule: `basis/unique-name`
		- no held thing names its plugin
			- construction: the types op, access-role, capability, skill and case have no link to a plugin
			- rule: `basis/fields` fails a field that a type does not have, so a note cannot add one
		- ops, roles and capabilities
			- construction: `definePlugin` makes the plugin's lists from the nodes it is given, and `readDefinition` refuses a list on the plugin node that is not the names of the nodes the definition holds
		- skills and cases
			- construction: the source makes the plugin's lists from its folders under `skills/` and from its `cases.ts` (`piecesOf`), and `definePlugin` and `readDefinition` refuse a plugin whose code gives either list
		- a note of the plugin that gives one of these lists again
			- rule: `basis/merge`, as each field of a node comes from one piece. The code always gives the lists, an empty one too
	- a domain uses skills: `usesSkills` on the plugin, and no skill names what uses it
		- construction: the skill type has no link back
	- an op and a skill use ops: `uses` on the user, and no op names what uses it
		- construction: the op type has no link back. Its `uses` names the ops it calls, never an op that calls it
		- the plugin's `usesOps` states none of these links again: `readPlugin` makes it from them, the plugin's piece leaves it out (`piecesOf`), and `definePlugin` and `readDefinition` refuse a plugin whose code gives it
	- an op runs with a role (`role` on the op), and a case is about a capability (`capability` on the case): access-role and capability list neither back
		- construction: the types access-role and capability have no link back
	- two relations are stated twice, on purpose, and a rule fails each place where the two differ
		- a case's plugin: the `cases.ts` that holds it gives it (the plugin's `cases`), and so does its capability, which one plugin holds. The evals run a case with the plugin whose `cases.ts` holds it
			- rule: `plugin/case-capability`
		- an op's plugin, when the plugin lists roles: the plugin's `ops` gives it, and so does its role, which one plugin holds
			- rule: `plugin/op-role`
	- gap: no rule fails a link that states the reverse of a link already there. The types hold this as they are, and review holds a change to them
- only the control plane reads a card: the card, `plugin.json`, is a bridge, written at publish, never committed; mount makes one for each plugin, in memory, and the control plane reads those, and nothing else of que's reads a card
	- the plugin schema names one bridge, `SkillFrontmatter`: the shape of a `SKILL.md`, which the plugin's author writes and que reads. que writes nothing to it, so this invariant does not reach it. The card is the one shape que writes, and it is no zod object, so it is not in `bridges`
	- one reader, in memory
		- construction: `writeCard` (`just card`) is the one user of the card's path (`pluginFiles`). `checkedCard` makes each mounted plugin's card in memory, and `access/control.ts` gives the control plane those cards; `readPlugin`, mount, the evals and the source read the plugin's code and skills, never a `plugin.json` in the folder. A plugin whose `plugin.json` holds anything checks, mounts and gives the same pieces (the tests of `just check-plugin`, mount and the source)
		- gap: no rule fails new code that reads a card, or a `plugin.json`, beyond the control plane. Review holds it
	- written at publish
		- construction: `just card` is the one writer
		- no rule yet: no publish of a plugin runs it, and que does not see a publish
	- never committed
		- construction: a deployment made from que's template ignores `plugin.json` (`templates/deployment/.gitignore`)
		- gap: a plugin in a repo of its own gets no ignore from que, and no rule fails a card that is committed
