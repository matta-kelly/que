/**
 * que's server: who is asking (@que/identity), `/ok`, the thread routes
 * and `/que/*` (run/api.ts). The UI talks to it, on port 2024 (listen.ts).
 * Importing this module does not listen on a port: listen.ts does.
 */

import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { sessionServer } from "./mcp/session.js";
import { admin } from "./run/admin.js";
import { app as api } from "./run/api.js";
import { signedIn, type SignedIn } from "./run/signed-in.js";
import { threads } from "./run/threads.js";

export const app = new Hono<SignedIn>();

// The health check: it needs no identity.
app.get("/ok", (c) => c.json({ ok: true }));

// The MCP mouth: a harness speaks the protocol here, on the same identity gate as every other route.
// Stateless: each request is a session of its own, so nothing is held between requests and no session id is issued.
app.post("/mcp", signedIn, async (c) => {
  const server = await sessionServer(c.get("user"));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

app.route("/threads", threads);
app.route("/", admin);
app.route("/", api);
