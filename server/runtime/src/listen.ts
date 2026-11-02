/**
 * que's server (serve.ts), listening on the port `PORT` names, 2024 with
 * none. Run with `npm run server`.
 */

import { checkAccessSettings } from "@que/identity";

// Before anything opens a database or a port: a start with a bad identity
// setting stops here, and names it.
checkAccessSettings();

// A lost storage connection stops this process: its session advisory lock went with the connection, so the next
// process takes it, and this one must not answer with storage it cannot see. The restart loop starts that one.
const { onStorageLost } = await import("./runner/pi/harness.js");
onStorageLost((why, error) => {
  console.error(
    `que: lost its storage: ${why}${error ? `: ${error.message}` : ""}. Stopping, so a process that can see it takes the lock`,
  );
  process.exit(1);
});

const { serve } = await import("@hono/node-server");
const { app } = await import("./serve.js");

const port = Number(process.env.PORT) || 2024;

serve({ fetch: app.fetch, port }, () =>
  console.log(`que's server listens on port ${port}`),
);
