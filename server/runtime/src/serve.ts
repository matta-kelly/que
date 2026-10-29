/**
 * que's server: who is asking (@que/identity), `/ok`, the thread routes
 * and `/que/*` (run/api.ts). The UI and the evals do not use it yet: they
 * use LangGraph on port 2024.
 * Importing this module does not listen on a port: listen.ts does.
 */

import { Hono } from "hono";
import { app as api } from "./run/api.js";
import { threads } from "./run/threads.js";

export const app = new Hono();

// The health check: it needs no identity.
app.get("/ok", (c) => c.json({ ok: true }));

app.route("/threads", threads);
app.route("/", api);
