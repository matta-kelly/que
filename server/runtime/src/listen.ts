/**
 * que's server (serve.ts), listening on its port. Run with `npm run server`.
 */

import { serve } from "@hono/node-server";
import { app } from "./serve.js";

const port = 2024;

serve({ fetch: app.fetch, port }, () =>
  console.log(`que's server listens on port ${port}`),
);
