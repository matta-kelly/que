---
type: doc
description: "Why the runtime keeps @modelcontextprotocol/sdk as a devDependency: the mouth serves on @modelcontextprotocol/server 2.x, and the v1 sdk is only the client the mcp tests speak through. Read before moving the sdk or the mcp tests."
status: active
---
The runtime's MCP mouth serves on `@modelcontextprotocol/server` 2.x. The v1
`@modelcontextprotocol/sdk` is not a runtime dependency: it is only the client
the tests beside this note speak through.

- `server.test.ts` and `stdio.test.ts` drive the mouth with the v1 `Client` and
  its transports (`InMemoryTransport`, `StdioClientTransport`). The v1 sdk
  speaks up to `2025-11-25`, so it is the 2025-era client.
- `http.test.ts` speaks HTTP to `/mcp` directly, for both eras.
- `package.test.ts` holds the line: the sdk appears in no runtime field
  (`dependencies`, `peerDependencies`, `optionalDependencies`).
