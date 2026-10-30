/**
 * Who is asking, for each route that serves a user: @que/identity says who,
 * @que/users gets or makes their row, and the route reads their id as
 * `c.get("userId")`, and their row as `c.get("user")`. A request with no
 * identity gets 401.
 */

import { createMiddleware } from "hono/factory";
import { identify } from "@que/identity";
import type { User } from "@que/users";
import { users } from "../access/users.js";

export type SignedIn = { Variables: { userId: string; user: User } };

export const signedIn = createMiddleware<SignedIn>(async (c, next) => {
  const identity = await identify(c.req.raw.headers);
  if (!identity) return c.json({ error: "Not signed in" }, 401);
  const user = await users.ensure(identity);
  c.set("userId", user.id);
  c.set("user", user);
  return next();
});
