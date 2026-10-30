/**
 * que's server (serve.ts), listening on the port `PORT` names, 2024 with
 * none. Run with `npm run server`.
 */

import { serve } from "@hono/node-server";
import { app } from "./serve.js";

const port = Number(process.env.PORT) || 2024;

serve({ fetch: app.fetch, port }, () =>
  console.log(`que's server listens on port ${port}`),
);
