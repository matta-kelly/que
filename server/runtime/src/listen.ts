/**
 * que's server (serve.ts), listening on the port `PORT` names, 2024 with
 * none. Run with `npm run server`.
 */

import { checkAccessSettings } from "@que/identity";

// Before anything opens a database or a port: a start with a bad identity
// setting stops here, and names it.
checkAccessSettings();

const { serve } = await import("@hono/node-server");
const { app } = await import("./serve.js");

const port = Number(process.env.PORT) || 2024;

serve({ fetch: app.fetch, port }, () =>
  console.log(`que's server listens on port ${port}`),
);
