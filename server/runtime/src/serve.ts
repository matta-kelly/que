/**
 * que's server: the one door for the UI and the evals. Who is asking
 * (@que/identity), `/ok`, the thread routes and `/que/*` (run/api.ts).
 *
 * Stub: the app only, with no routes, for the tests to reach their assertions.
 * Importing this module does not listen on a port.
 */

import { Hono } from "hono";

export const app = new Hono();
