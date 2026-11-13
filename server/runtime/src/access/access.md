---
type: component
description: "Access, the server step that decides what one user can reach: the user's granted domains and the connectors they reach whose login resolves, with one connection per plugin and rep, opened when first used. Also the users store. Read before changing who gets which plugin, or how credentials and connections are kept. The code is in this folder."
status: running
---
Access decides what one user can reach. It works per plugin: a user gets a whole plugin, or none of it.
- [[#Catalog]] the plugins one user can use
- [[#Credentials and connections]] the one place credentials are handled
- [[#Users]] the users store

- [[que]]: the server, whose second step this is. Mount comes before it, the door and MCP after
- [[plugin-contract]]: the contract it reads (`credential`, `connect`, `whoami`)
- [[agent-governance]]: the read/propose/update split and an owner for each action. Not built

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
	- a user with no login gets an `OpFailed` that names the connector, and the role when the op has one, and never the user id
		- on the user's own login, with no credential stored: `you have no <connector> login: connect it under Settings, Connections`
		- on a `role:<role>` login, with no credential stored: `you have no <connector> login for <role>: ask an admin to set the role's login`
		- on no login at all, and no domain reaches the connector: `you have no <connector> login: no domain reaches it`
		- on no login at all, and domains reach the connector and, when the op has one, give its role: `you have no <connector> login[ for <role>]: ask an admin for a domain that reaches it: <domains>`, the domains that reach it, and give the role when the op has one
		- on no login for the op's role, and no domain gives that role: `you have no <connector> login for <role>: no domain gives that role: ask an admin for a domain that gives it`
	- a domain op gets no connection: each connector op it calls asks for its own, on the login of the connector's op
- not built: each op is read, propose or update, and has an owner, and each call is checked against that split for the user
- a credential is saved only once it matches the connector's schema, and `connect` succeeds with it when the connector has `connect`
- the list of saved credentials (the Connections page) holds every saved one, also one that no longer matches the schema, which the catalog leaves out
- one connection per plugin and rep, opened when it is first used: by an operation, or by `whoami` in the catalog
	- a changed or re-entered credential opens a new connection, and the old one is dropped
	- a failed login is tried again on the next call

## Users

`users.ts`

- one users store for the server: the sign-in (`run/signed-in.ts`), the settings API and MCP use it
- a user is made on first sign-in, and the first user is an admin
