---
type: component
description: "Access, the harness step that decides what one user can reach: the plugins that need no credential or whose credential the user has saved, narrowed to the plugins the run's agent names, with one connection per user and plugin, opened when first used. Also the users store and the user's own instructions. Read before changing who gets which plugin, how credentials and connections are kept, or where a user's instructions come from. The code is in this folder."
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

- the mounted plugins one user can use right now: a plugin that needs no credential, or one whose credential the user has saved and that still matches the plugin's schema
- each with who the user is in that service, when the plugin has `whoami`
	- asking opens that plugin's connection
	- when `whoami` fails, the identity is left out, and asked again on the next call

## Credentials and connections

`access.ts`, on the credential store it is given (`accessOn(store)`). `connections.ts` makes the runtime's one, on the store it makes once with `createStore()`

- credentials are stored encrypted (`@que/credentials`), one per user and plugin
- the door asks for a connection by the op's plugin and role and the user (`getConnection`)
	- one credential serves every role of a plugin, so the role does not change the connection
	- a user with no credential the plugin needs gets an `OpFailed` that names the plugin
- a credential is saved only once it matches the plugin's schema, and `connect` succeeds with it when the plugin has `connect`
- the list of saved credentials (the Connections page) holds every saved one, also one that no longer matches the schema, which the catalog leaves out
- one connection per user and plugin, opened when it is first used: by an operation, or by `whoami` in the catalog
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
