---
type: doc
description: "The Access JWT probe for que-mcp Phase 0: whether a token from que's login, presented to que's HTTP entrypoint the way an external MCP client will present it, verifies and yields the same que user. Read before Phase 1 relies on identity for MCP."
status: active
---

The probe: the test beside this note starts que's server as a process with
`QUE_ACCESS_TEAM_DOMAIN` and `QUE_ACCESS_AUDIENCE` set, serves the team's key set
on localhost, signs an Access JWT with that key, and presents the token to
`GET /que/me` in `cf-access-jwt-assertion`, as an external MCP client presents
it.

Result: pass.

Grounds:

- The verified token: RS256, signed by the team's key (`kid` `the-team-key`),
  whose public key the server read from the team domain's key set.
- Its issuer is the team domain, and its audience is `the-que-application`:
  both match the server's `QUE_ACCESS_TEAM_DOMAIN` and `QUE_ACCESS_AUDIENCE`.
- Its `email` claim is `ana.lima@example.com`, and the route answered 200 with
  that email and the name `ana.lima`.
- The verified token yields the same que user: a second token for
  `ana.lima@example.com` answered the same que user id.
- A token for `ben.lima@example.com` answered a different que user id, so the
  email in the verified claims decides the user, not a plain header.
