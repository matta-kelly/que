/**
 * The admin API: `/que/admin/*` is for an admin alone, and reads the runtime's control plane. A request with no
 * identity gets 401; one from a member gets 403, on every admin path.
 */

import { Hono } from "hono";
import { control } from "../access/control.js";
import { users } from "../access/users.js";
import { signedIn, type SignedIn } from "./signed-in.js";

export const admin = new Hono<SignedIn>();

admin.use("/que/admin/*", signedIn, async (c, next) => {
  if (c.get("user").role !== "admin")
    return c.json({ error: "Only an admin can do this" }, 403);
  return next();
});

admin.get("/que/admin/domains", async (c) => c.json(await control.domains()));

admin.get("/que/admin/users", async (c) =>
  c.json(
    await Promise.all(
      (await users.list()).map(async (user) => ({
        ...user,
        grants: await control.grantsOf(user.id),
      })),
    ),
  ),
);

// A grant of a plugin that is no domain is a 400; of a user that is not there, a 404.
admin.put("/que/admin/users/:id/grants/:domain", async (c) => {
  const id = c.req.param("id");
  if (!(await users.get(id))) return c.json({ error: "not found" }, 404);
  try {
    await control.grant(id, c.req.param("domain"), c.get("userId"));
  } catch (error) {
    if (error instanceof Error) return c.json({ error: error.message }, 400);
    throw error;
  }
  return c.json({ ok: true });
});

// A revoke of a user or a domain that is not there changes nothing, and answers as a revoke does.
admin.delete("/que/admin/users/:id/grants/:domain", async (c) => {
  await control.revoke(c.req.param("id"), c.req.param("domain"));
  return c.json({ ok: true });
});
