/**
 * Who is asking, for each route that serves a user: @que/identity says who,
 * @que/users gets or makes their row, and the route reads their id as
 * `c.get("userId")`. A request with no identity gets 401.
 */

import { createMiddleware } from "hono/factory";
import { identify } from "@que/identity";
import { users } from "../access/users.js";

export type SignedIn = { Variables: { userId: string } };

export const signedIn = createMiddleware<SignedIn>(async (c, next) => {
  const identity = await identify(c.req.raw.headers);
  if (!identity) return c.json({ error: "Not signed in" }, 401);
  c.set("userId", (await users.ensure(identity)).id);
  return next();
});
