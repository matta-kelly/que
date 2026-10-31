---
type: component
description: "Access, the harness step that decides what one user can reach: the user's granted domains and the connectors they reach whose login resolves, narrowed to the plugins the run's agent names, with one connection per plugin and rep, opened when first used. Also the users store and the user's own instructions. Read before changing who gets which plugin, how credentials and connections are kept, or where a user's instructions come from. The code is in this folder."
status: running
---
Access decides what one user can reach. It works per plugin: a user gets a whole plugin, or none of it.
- [[#Catalog]] the plugins one user can use
- [[#Credentials and connections]] the one place credentials are handled
- [[#Narrow]] the plugins one chat gets
- [[#Users]] the users store
- [[#Instructions]] the user's own instructions for a chat

- [[que]]: the harness, whose second step this is. Mount comes before it, assemble after
- [[plugin-contract]]: the contract it reads (`credential`, `connect`, `whoami`)

---
## Catalog

`catalog.ts`

- the mounted plugins one user can use right now: a plugin that needs no credential, or a connector whose credential the user has saved and that still matches the connector's schema
	- the user's granted domains, and each connector those domains reach whose login resolves. A domain holds no credential, so a grant is all it needs; a reached connector with no credential saved is left out (the que-control-plane issue, in kinetic)
	- a domain is in it also when the user has not connected a connector it uses. A call to that connector fails there
- each with who the user is in that service, when the plugin has `whoami`
	- asking opens that plugin's connection
	- when `whoami` fails, the identity is left out, and asked again on the next call

## Credentials and connections

`access.ts`, on the credential store and the control plane it is given (`accessOn(store, control)`). `connections.ts` makes the runtime's one, on the store it makes once with `createStore()`

- credentials are stored encrypted (`@que/credentials`), one per rep and connector, as only a connector gives a credential. A rep is a user's own id, or `role:<role>`
- the door asks for a connection by the op's plugin and role and the user (`getConnection`)
	- the op runs on the login the control plane names: the user's own id for a third-party connector, `role:<role>` for an internal one whose role a granted domain gives (the que-control-plane issue, in kinetic)
	- a role login is built: one credential serves every user who holds the role, so those users share its one connection
	- a user with no login gets an `OpFailed` that names the connector, and the role when the op has one
	- a domain op gets no connection: each connector op it calls asks for its own, on the login of the connector's op
- a credential is saved only once it matches the connector's schema, and `connect` succeeds with it when the connector has `connect`
- the list of saved credentials (the Connections page) holds every saved one, also one that no longer matches the schema, which the catalog leaves out
- one connection per plugin and rep, opened when it is first used: by an operation, or by `whoami` in the catalog
	- a changed or re-entered credential opens a new connection, and the old one is dropped
	- a failed login is tried again on the next call

## Narrow

`narrow.ts`

- the run's agent config names its plugins, and the catalog keeps only those
- it can only take plugins out, so a plugin the user cannot reach stays out

## Users

`users.ts`

- one users store for the harness: the server's sign-in (`run/signed-in.ts`), the API and a run use it
- it binds the instructions file the deployment names, and a user's instructions, from [[#Instructions]]

## Instructions

`instructions.ts`

- the user's own instructions for a chat come from one of two places
	- the file a deployment names in `DEV_USER_INSTRUCTIONS`. A relative path is taken from the deployment's folder
		- read whole when each run starts, so an edit is in the next run
		- a file that cannot be read is an error that names it, and que stops at startup
	- with no file named, the text saved on the user's account
		- at most 16,000 characters. Blank text is saved as none
		- a change to it is refused (409) while a file is named
- an agent takes them when its config says so, and never when the text is blank
