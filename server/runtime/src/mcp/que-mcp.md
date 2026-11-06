---
type: service
description: "que-mcp, que's MCP server: a deployment's plugin ops as MCP tools for a harness that is not que, as the same que user, on the same access. Read before changing where a harness connects, how the caller is identified, or what tools it gets. The code is in this folder."
status: running
---
que's plugin ops as MCP tools, for a harness that is not que. A harness gets what the same user gets in que's chat, and nothing more.
- [[#Mouths]] where a harness connects
- [[#Identity]] who the caller is
- [[#Tools]] what the caller gets

- [[que]]: the harness whose deployment serves it
- [[access]]: the catalog its tools come from
- `package.md`: why the v1 sdk is only a test dependency

---
## Mouths

- HTTP: `POST /mcp` on the deployment's own server (`serve.ts`), for a harness on another machine
	- a route of the server the deployment already runs, so it moves with the deployment, with nothing to set up
	- stateless: each request is a session of its own, with no session id
	- protocol 2026-07-28 through the SDK's handler. A 2025-era request gets a JSON body, wired by hand
	- `GET` and `DELETE` answer 405
- stdio: `npm run mcp` (`stdio.ts`), for a harness that starts a process on the same machine
- both mouths build the session in one place (`session.ts`)

## Identity

- the caller is the que user its Access JWT names, as for a browser. There is no second login
	- HTTP: the `signedIn` gate of every route
	- stdio: `QUE_ACCESS_JWT` carries the token. In dev, `DEV_USER_EMAIL` decides
- a session with no user gets `whoami` alone

## Tools

- one tool per op of each plugin in the user's catalog, and `whoami`
	- the catalog is the one access gives the chat, and each call runs through the door as that user
- name: `<plugin>.<op>`, lowercased, in `[a-z0-9._-]`, at most 64 characters. Two ops that come to one name are refused when the tools are made (`tools.ts`)
- the tools are made when a session starts, so a deployment change shows from the next request (HTTP) or the next process (stdio)
- an op that needs approval cannot be approved over MCP
	- a call that needs approval is refused, and the tool's description says so
	- the tool carries `destructiveHint`
