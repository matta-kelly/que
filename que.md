---
type: service
description: "que, a harness that knows no role, job or company: everything it can do comes from plugins, and an agent is a config over them. Reference for what que is, what it is made of, the plugin contract, and the work in flight on it; how to run and check it is in the repo's README."
status: planned
---
A harness that knows no role, job or company. Everything it can do comes from plugins.
- [[#Thesis]] the rule everything below follows, and the whole shape in one picture
- [[#Parts]] environment and agent, which are defined; harness and backend, which are que; and the deployment they make

- [[daworks]]: my projects, this is one of them
- built on [[basis]] (`~/lot/daworks/basis`, GitHub matta-kelly/basis): que imports it, and hands it to the folders it mounts and checks
- [[shit-sdlc]]: the loop every change to que goes through
- [[daworks/que/server/core/plugin|plugin]]: the plugin contract as built
- [[que-ui]]: the chat UI: what it is built on, what it shows, and the outside components that fit. Its Work has the designs in flight on the UI
- [[evals]]: how an agent is checked: the stores, the movers and the loops. que has two parts of it
	- the eval runner: `just eval` in a deployment runs each case of its plugins under each of its agent configs, and prints what the agent did. With the Langfuse settings, it keeps each run in Langfuse, as an experiment on a dataset mirrored from the cases
	- one grader, the judge: with `QUE_JUDGE` set, a model is asked the `good` of each case about its run, and the verdict is printed and kept as a score
	- tracing: que sends a trace of each run to the deployment's Langfuse
- first environment: lotusandluna. Its notes are in the company vault `~/cc` (start at `cc.md`). Links do not cross vaults, so they are named here in plain text
- this folder is que's git repo (GitHub: matta-kelly/que)


#### Desk
- In flight
	
- Next
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
		- que gives the deployment's Langfuse the price of each of its models, the ones it fills at mount, so a cost in Langfuse is the cost the chat shows. Langfuse has no price for que's models, and counts them at zero.
	- general goal of something that runs locally but cna be persistent  --> can mount files but it also artifact native
	- evals / UI: impalement some feedback component --> would be nice to tie to traces at some point
		- [component](https://www.assistant-ui.com/elements/feedback-dialog)
	- que in the basis lens: the ontology is a layer over the code, not the code. que's vocabulary (plugin, op, skill, case, capability, agent, model, loop, deployment) is a subgraph on basis, in `@que/ontology`. Nodes describe real things and point at their code; lint checks the two agree. The runtime runs the code, and the agent navigates the layer
	- que mounts itself: a que plugin (que's ontology plus skills) and a capability plugin (the rail as skills) make a builder agent that navigates the factory and builds agents in it

---
## Thesis

- The harness knows nothing about a role, a job, or a company
	- its one job: make the environment legible and navigable (what exists, what it does, how to reach it)
	- everything else is a plugin
- Two things are defined, and que runs them
	- environment: a named set of plugins. What can be done
	- agent: a harness config over part of an environment. Which plugins, and one choice per unit
		- the user chat is one agent: wide environment, lazy loading
		- a purpose-built agent is another: three plugins, eager, maybe a workspace
		- a role or a purpose is in the agent's config. So the harness still knows none
- que is two things
	- harness: puts an environment and an agent together
	- backend: what an agent runs on
- A deployment is one live instance: an environment and its agent config, on que
- que composes standard agent parts: it defines how they are declared and put together, not the parts

```
defined                        que
-------                        ---
environment ───────────▶  mount     load and check the plugins
  plugins
                          access    for one user: the plugins they
                                    can reach, each with its connection
agent ─────────────────▶  assemble  turn its units into prompt,
  units                             tools, middleware
                          run       give those to the framework,
                                    serve the answer
                          ─────────────────────────────────────
                          backend   identity, credentials, state
```

## Parts

- **Environment**: a named set of plugins, and nothing more. The seam with the harness
	- written in the deployment's definition, as `plugins`: each one a folder path
	- kept in a folder outside que. que names no environment
	- what a company knows goes in as a plugin too: a plugin can hold skills only
	- one promise from the harness: it mounts what is listed, and nothing else
	- **Plugin**: one concern, in one folder. The contract as built: [[daworks/que/server/core/plugin|plugin]]
		- what every plugin gives the harness, so the harness can do its job without knowing the domain
			- identity: name, title, description (what it is, when to use it). **The only required part**
			- needs: what it requires to load. Unmet → not loaded
			- text: skills, read on demand
			- code: ops, which the model calls
		- the contract lists what a plugin *can* have, not what it *must* have. A plugin carries only the parts it uses: skills only, ops only, or both
		- a plugin does not know which agent uses it, or how it is shown
		- the boundary
			- op: model → plugin
			- hook: harness → plugin, on an event. Not built. It is the interception unit, seen from the plugin
			- extension: plugin → harness. Not a plugin, it is harness code
			- test: if removing the folder needs a harness change, it was an extension
- **Agent**: a harness config over part of an environment
	- written as a file of its own, made with `defineAgent`. The deployment's definition lists its agent files, as `agents`
		- it holds a `name`, `plugins`, `model` and `loop`, which are required, and `instructions`, `loading` and `userInstructions`, which are optional: left out, que's role text, `on-demand`, and no user instructions
		- a deployment can list several. A run names the one it wants, and a run that names none gets the first
		- a deployment lists at least one agent, one model and one loop. que owns no config of its own
		- a unit goes in the config when it has two variants
	- a config is made of units, not slots
		- slot: where a thing lands in a model request (prompt, tools, middleware)
		- unit: one decision that can change while the others stay the same. One unit can write to more than one slot
		- a unit is written in que's own types, as the plugin contract is
	- what the agent is
		- model. A model config is a file with a name, the provider's model, and the most tokens of one reply. A deployment lists several in `models`
			- the file holds the choices. que fills in what is true of the model at startup: its window from the provider, and its price from a public model database. A value written in the file wins
			- which one a run gets: the one the run names, else the one the agent config names
			- the chat UI has a picker for the agent and one for the model, and keeps the pick with the thread
		- instructions. From the config, in place of que's role text
		- the user's own instructions. Text that belongs to the user, and not to the agent: how the agent works with them. A config takes them with `userInstructions`, and one that does not say gets none
			- they go in the system prompt after the agent's instructions, which stand where the two do not agree
			- the config does not say where the text is from. The backend does: a file the deployment names, or what the user saved in Settings
		- capabilities: which plugins. From the config, which lists them (`[]` means none). The config narrows what a user can reach, and never widens it
		- loading: what the model is shown of the environment, and when. It is how this agent gets the harness's one job done, to make the environment legible
			- it sets the text that explains the environment, the tools for finding the way around, and which operations go out with each request
			- two variants, named in `loading`: `on-demand`, where the model opens a plugin, then loads an operation or reads a skill; and `eager`, with every operation in reach from the first message
		- [[loop-policy|loop policy]]. A loop config is a file with a name and settings. A deployment lists several in `loops`, and an agent config names one in `loop`
			- every agent is LangChain `createAgent`, and each setting that acts adds one middleware to it
			- a big tool result goes to a file store, and the model reads it back with `read_file`
			- a summary of a long chat replaces the old part of the thread
			- an agent names its loop. A setting a loop leaves out takes que's value for it
		- interception: hooks on the loop. Not built
		- delegation: another agent, called as a tool. Not built
	- where the agent runs. Each one is a request to the backend
		- principal: who it acts as. Per user
		- state. The LangGraph thread
		- workspace. None
		- trigger and lifetime. A chat
- **Harness**: the code that puts an environment and an agent together. Part of que. Four steps, in the order the work flows
	- mount: an environment in, checked plugins out. Once, at startup, the same for every user
		- loads each plugin the environment lists, and checks it against the contract
		- reads each agent, loop and model config the deployment lists
		- stops when an agent names a plugin that is not mounted, or a loop or a model that is not listed
	- access ([[access]]): for one user, the mounted plugins they can reach, each with its connection
		- narrowed to the plugins the agent config of the run names
	- assemble: an agent's units in, the slots out (prompt, tools, middleware)
		- built for one unit, loading: one config on a shared base
	- run: hands the slots to the framework, and serves the answer
		- the only step that names a framework
		- sends a trace of each run to Langfuse, when the deployment's `.env` has the Langfuse settings: each model call and each tool call, with the user, the thread, the agent config and the commit of que. With no settings it sends nothing
		- on LangChain and the LangGraph server
- **Backend**: what an agent runs on. Part of que. One exists
	- what it supplies
		- identity, users and credentials: on Postgres
		- state and the trigger: the LangGraph server
		- workspace: none
	- its settings, in a `.env`
		- user: `DEV_USER_EMAIL`, `DEV_USER_NAME`, and `DEV_USER_INSTRUCTIONS`, a file with the user's own instructions. With none named, they are on the user's account
		- storage: `POSTGRES_PASSWORD`, `DATABASE_URL`, `QUE_CREDENTIALS_KEY`
		- model: `FIREWORKS_API_KEY`, the key of the one provider que has
		- traces: `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`. All three, or none
- **Deployment**: one live instance: an environment and its agent config, on que's harness and a backend
	- one folder holds its definition (`index.ts`: the environment's `plugins`, and the lists of its `agents`, `loops` and `models`), the files of its own those lists name, and its backend settings (`.env`), and starts que with `just start`
	- the code names it the same way: `defineDeployment`, `QUE_DEPLOYMENT`
	- how to start, stop and check one is in the README

