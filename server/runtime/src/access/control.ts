/**
 * The runtime's control plane: made once, when que starts, on the cards mount made and DATABASE_URL, as access is made
 * once on the credential store (connections.ts). Every caller in the runtime reads grants and reach through it.
 */

import pg from "pg";
import { controlOn } from "@que/control-plane";
import { plugins } from "../mount/mounted.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new pg.Pool({ connectionString: databaseUrl });
// A connection that sits idle in the pool can still be lost (Postgres restarts, or the network drops). The pool
// drops it and says so with an "error" event, which, with no listener, would end the process (node-postgres, Pool).
pool.on("error", (error) =>
  console.error("que: an idle Postgres connection was lost:", error.message),
);

export const control = controlOn(
  pool,
  plugins.map(({ card }) => card),
);
