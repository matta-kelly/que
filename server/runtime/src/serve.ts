/**
 * que's server: who is asking (@que/identity), `/ok`, the MCP mouth `/mcp`,
 * and the settings routes `/que/*` (run/api.ts, run/admin.ts) the UI talks to,
 * on port 2024 (listen.ts). Importing this module does not listen on a port:
 * listen.ts does.
 */

import { Hono } from "hono";
import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { sessionServer } from "./mcp/session.js";
import { admin } from "./run/admin.js";
import { app as api } from "./run/api.js";
import { signedIn, type SignedIn } from "./run/signed-in.js";

export const app = new Hono<SignedIn>();

// The health check: it needs no identity.
app.get("/ok", (c) => c.json({ ok: true }));

// The MCP mouth: a harness speaks the protocol here, on the same identity gate as every other route.
// Stateless: each request is a session of its own, so nothing is held between requests and no session id is issued.
// The handler serves protocol 2026-07-28. The 2025-era leg is hand-wired, because the SDK's own stateless
// fallback always streams SSE and this mouth answered a JSON body before the move to the v2 SDK.
app.post("/mcp", signedIn, async (c) => {
  const user = c.get("user");
  const request = c.req.raw;

  // 2026-07-28 traffic: the SDK's per-request handler. Legacy traffic is routed below, so it is refused here.
  if (!(await isLegacyRequest(request))) {
    const handler = createMcpHandler(() => sessionServer(user), {
      legacy: "reject",
    });
    return handler.fetch(request);
  }

  // 2025-era traffic: one stateless transport per request, answering JSON instead of an SSE stream.
  const server = await sessionServer(user);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  await transport.close();
  await server.close();
  return response;
});

// A stateless session offers no SSE stream for a GET, and nothing to end for a DELETE.
// 405 with allow: POST is the refusal the MCP spec and the SDK client read as correct.
app.on(["GET", "DELETE"], "/mcp", (c) => c.body(null, 405, { allow: "POST" }));

app.route("/", admin);
app.route("/", api);
