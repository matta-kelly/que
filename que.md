---
type: service
description: "que, an MCP server that knows no role, job or company: everything it serves comes from plugins, and each user gets the ops and skills their access reaches. Reference for what que is, what it is made of, the plugin contract, and the work in flight on it; how to run and check it is in the repo's README."
status: planned
---
An MCP server that knows no role, job or company. Everything it serves comes from plugins.
- [[#Thesis]] the rule everything below follows, and the whole shape in one picture
- [[#Parts]] the environment, which is defined; the server and the backend, which are que; and the deployment they make
- [[#Invariants]] what the harness schema holds true of every graph, that basis leaves to it, each with the rule or construction that holds it. The plugin schema's are in [[plugin-contract#Invariants]]

- built on [[basis]] (`~/lot/daworks/basis`, GitHub matta-kelly/basis): que imports it, and hands it to the folders it mounts and checks
- [[plugin-contract]]: the plugin contract as built
- [[que-mcp]]: the MCP server: where a client connects, who it is, and the tools and skills it gets
- [[access]]: who gets what: the catalog of each user, their logins and their grants
- [[que-pasa]]: que-v2's harness, the redesign: people are given agents built from one workspace, not tools. Being built
- first environment: lotusandluna. Its notes are in the company vault `~/cc` (start at `cc.md`). Links do not cross vaults, so they are named here in plain text
- this folder is que's git repo (GitHub: matta-kelly/que)


#### Desk
- Needs
	- UI/ user Functionality
		- authentication
		- admin page: users and permissions
	- Agent
		- have a better concept of what it can produce and how to use it
			- closely tied to the notion of how to decompose something 
			- use components like these effectively [one (of many) structured output component](https://www.assistant-ui.com/elements/spec-sheet)
- Inbox
	- still think yaml config might be sick
	- prices into Langfuse: 
		- que gives the deployment's Langfuse the price of each of its models that has one, so a cost in Langfuse is the cost the chat shows. Langfuse has no price for que's models, and counts them at zero.
	- general goal of something that runs locally but cna be persistent  --> can mount files but it also artifact native
	- evals / UI: impalement some feedback component --> would be nice to tie to traces at some point
		- [component](https://www.assistant-ui.com/elements/feedback-dialog)
	- que in the basis lens: que's vocabulary (plugin, op, skill, capability, deployment) is a subgraph on basis: the plugin schema in `@mku1tra/que-plugin`, and the harness schema in `@mku1tra/que-harness`, and que's code is built from their types. A plugin's things are nodes, read from its code; a note of the same name is another piece of the same node. Each `define*` marks each node it gives as a definition (`markDefinition`), and each schema gives its package's exports, so a lint fails a definition no source reads (`basis/definition-piece`). The runtime runs the code
	- que mounts itself: a que plugin (que's ontology plus skills) and a capability plugin (the rail as skills) make a builder agent that navigates the factory and builds agents in it
	- Look into mem0 for memeory
	- durable harness : the state written before each step, so after a crash a run replays and goes on, and no tool call that is done runs again. Open: what que loses now when its process stops mid-turn. que-pasa's loop does this ([[que-pasa-loop#After a crash]])

---

## Thesis

- The server knows nothing about a role, a job, or a company
	- its one job: give each user, over MCP, what their access reaches of the environment: its ops as tools, and its skills
	- everything else is a plugin
- One thing is defined, and que serves it
	- environment: a named set of plugins. What can be done, and how this business does it
- que is two things
	- server: mounts an environment, works out each user's catalog, and serves it over MCP
	- backend: what the server stands on: identity, users, credentials, grants
- A deployment is one live instance: an environment, on que
- Any MCP client is a client of que: an AI harness on a laptop, or another runtime. que runs no agent and calls no model

```
defined                        que
-------                        ---
environment ───────────▶  mount     load and check the plugins,
  plugins                           and their skills
  (ops, skills)
                          access    for one user: the plugins they
                                    can reach, and their logins
                          door      run an op as the user
                          mcp       serve the user's ops as tools,
                                    and their plugins' skills
                          ─────────────────────────────────────
                          backend   identity, users, credentials,
                                    grants
```

## Parts (packages)

- **Environment**: a named set of plugins, and nothing more. The seam with the server
	- named in the deployment's definition, as `plugins`: each one the name of its npm package, installed where Node finds an import from the deployment's folder
	- kept in a folder outside que. que names no environment
	- what a company knows goes in as a plugin too: a plugin can hold skills only
	- one promise from the server: it mounts what is listed, and nothing else
	- **Plugin**: one concern, in one folder. The contract as built: [[plugin-contract]]
		- what every plugin gives the server, so the server can do its job without knowing the domain
			- identity: name, title, description (what it is, when to use it). **The only required part**
			- needs: what it requires to load. Unmet → not loaded
			- text: skills, which a client reads when a task needs one
			- code: ops, which a client calls as tools
		- the contract lists what a plugin *can* have, not what it *must* have. A plugin carries only the parts it uses: skills only, ops only, or both
		- a plugin does not know which client uses it
- **Server**: the code that serves an environment. Part of que, in `@que/runtime`. Each layer is a folder in `server/runtime/src/`
	- boundary: what crosses into and out of the server
		- in
			- plugins, through the plugin contract (`@mku1tra/que-plugin`)
			- the deployment's definition, written against `@mku1tra/que-harness`
			- the backend: users, credentials, grants and identity (`@que/users`, `@que/credentials`, `@que/control-plane`, `@que/identity`)
		- out
			- MCP, to any client: the user's ops as tools, and their plugins' skills ([[que-mcp]])
			- the settings API, to the UI: the user's account and logins, and an admin's users and grants
			- a plugin's card (`plugin.json`), at its publish: `card/` writes it from the plugin's nodes, and nothing of que's reads it
	- composition: what each layer owns, and what it hands to the next
		- mount (`mount/`): what exists. Reads the deployment and each plugin it names (`readDeployment`), and lints them as one graph from the deployment's root, the root whose ground holds its folder (`deploymentGraph`): a lint starts only at a root. Stops on any problem: a file that cannot be read, a name that is no node, a rule, a skill the MCP skills extension cannot serve. Hands on: the mounted plugins, each with its skills as MCP serves them (`mount/skills.ts`)
		- access (`access/`, [[access]]): who gets what. For one user, the mounted plugins they can reach, and the connection to each service, opened when an op first uses it. Hands on: the catalog
		- door (`assemble/door.ts`): every op runs through it, as one user: it parses the input, refuses a call that needs approval, opens the login, and runs the op
		- mcp (`mcp/`): serving the catalog. One session per request (HTTP) or per process (stdio), with the user's tools and skills ([[que-mcp]])
		- settings (`run/`): the routes the UI calls: account, connections, users and grants
	- flow: when each layer runs
		- que starts: mount, once, the same for every user
		- each MCP session: access, then the tools and skills of that catalog. A grant or a login change takes effect from the next session
- **Settings UI**: the web app in `ui/`, on the settings API. A user saves their own logins; an admin grants domains and sets roles
- **Backend**: what the server stands on. Part of que. One exists
	- what it supplies
		- identity: the Cloudflare Access JWT, or a dev user
		- users, credentials and grants: on Postgres
	- its settings, in a `.env`
		- user: `DEV_USER_EMAIL`, `DEV_USER_NAME`, for a deployment with no Access in front
		- storage: `POSTGRES_PASSWORD`, `DATABASE_URL`, `QUE_CREDENTIALS_KEY`
- **Deployment**: one live instance: an environment, on que's server and a backend
	- one folder holds its definition (`index.ts`: the names of its `plugins`), its plugins installed as npm packages, and its backend settings (`.env`), and starts que with `just start`
	- the code names it the same way: `defineDeployment`, `QUE_DEPLOYMENT`
	- how to start, stop and check one is in the README

## Invariants

basis leaves two invariants to the schema that states a relation or writes a bridge ([[basis#Validation]]). These are the harness schema's (`@mku1tra/que-harness`). Under each is the rule or the construction that holds it. A gap is a blind spot of the holder above it.

- a relation is stated once: one link, on one node, and its reverse comes from the graph
	- a deployment names its plugins (`plugins`), and no plugin names its deployment
		- construction: the plugin schema's types have no link to a deployment
		- rule: `basis/fields` fails a field that a type does not have, so a note cannot add one
	- gap: no rule fails a link that states the reverse of a link already there. The types hold this as they are, and review holds a change to them
- nothing reads what que writes to a bridge's shape: the harness schema writes no bridge. The plugin schema's card is in [[plugin-contract#Invariants]]
