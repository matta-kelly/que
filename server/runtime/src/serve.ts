/**
 * que's server: who is asking (@que/identity), `/ok`, the thread routes
 * and `/que/*` (run/api.ts). The UI talks to it, on port 2024 (listen.ts).
 * Importing this module does not listen on a port: listen.ts does.
 */

import { Hono } from "hono";
import { createMcpHandler } from "@modelcontextprotocol/server";
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
// The handler serves protocol 2026-07-28, and the SDK's stateless fallback serves 2025-era traffic.
app.post("/mcp", signedIn, async (c) => {
  const user = c.get("user");
  const handler = createMcpHandler(() => sessionServer(user));
  return handler.fetch(c.req.raw);
});

// A stateless session offers no SSE stream for a GET, and nothing to end for a DELETE.
// 405 with allow: POST is the refusal the MCP spec and the SDK client read as correct.
app.on(["GET", "DELETE"], "/mcp", (c) => c.body(null, 405, { allow: "POST" }));

app.route("/threads", threads);
app.route("/", admin);
app.route("/", api);
