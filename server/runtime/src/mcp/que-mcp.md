---
type: service
description: "que-mcp, que's MCP server: a deployment's plugin ops as MCP tools and its plugins' skills, for any MCP client, as one que user, on that user's access. Read before changing where a client connects, how the caller is identified, or what tools and skills it gets. The code is in this folder."
status: running
---
que's MCP server: the one way out of que. A client gets the ops and skills of the plugins the user can reach, and nothing more.
- [[#Mouths]] where a client connects
- [[#Identity]] who the caller is
- [[#Tools]] the ops the caller can run
- [[#Skills]] how the caller's business does a task with those tools

- [[que]]: the server whose deployment it serves
- [[access]]: the catalog its tools and skills come from
- [[skill-contract]]: what a skill holds
- `package.md`: why the v1 sdk is only a test dependency

---
## Mouths

- HTTP: `POST /mcp` on the deployment's own server (`serve.ts`), for a client on another machine
	- a route of the server the deployment already runs, so it moves with the deployment, with nothing to set up
	- stateless: each request is a session of its own, with no session id
	- protocol 2026-07-28 through the SDK's handler. A 2025-era request gets a JSON body, wired by hand
	- `GET` and `DELETE` answer 405
- stdio: `npm run mcp` (`stdio.ts`), for a client that starts a process on the same machine
- both mouths build the session in one place (`session.ts`)

## Identity

- the caller is the que user its Access JWT names, as for a browser. There is no second login
	- HTTP: the `signedIn` gate of every route
	- stdio: `QUE_ACCESS_JWT` carries the token. In dev, `DEV_USER_EMAIL` decides
- a session with no user gets `whoami` alone, and no skills

## Tools

- one tool per op of each plugin in the user's catalog, and `whoami`
	- each call runs through the door as that user
- name: the op's own name, the name its plugin's skills use. In `[a-z0-9._-]`, at most 64 characters. A name outside that, or two ops with one name, are refused when the tools are made (`tools.ts`)
- the tools are made when a session starts, so a deployment, grant or login change shows from the next request (HTTP) or the next process (stdio)
- an op that needs approval cannot be approved over MCP
	- a call that needs approval is refused by the door: `<op> needs approval, and it cannot be approved over MCP: the call did not run`
	- the tool's description says so, and the tool carries `destructiveHint`

## Skills

- the skills of each plugin in the user's catalog, each one `SKILL.md`, as the MCP skills extension (SEP-2640, `io.modelcontextprotocol/skills`) serves it
	- made once at mount (`mount/skills.ts`): its frontmatter as written, and the sha256 digest and size of the file. A skill the extension cannot serve stops the mount
	- URI: `skill://<plugin>/<skill>/SKILL.md`
	- served through the SDK's `SkillsExtension`, on a source of the session's own skills (`skills.ts`): `skills/list`, `skills/get`, and `resources/read` of the URI
- a client without the extension gets them as standard MCP
	- the server instructions name each skill with its description and URI, and say to read it before a task it covers
	- `resources/list` gives each `SKILL.md`, and `resources/read` gives its text
- every session declares the extension, also one with no skills, so each caller sees one shape
- stateless HTTP sends no `list_changed`: a change shows from the next request
- a skill's `allowed-tools` names the ops it uses. A client may ignore it: the catalog decides what the user can run, and a skill only guides
