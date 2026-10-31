/**
 * The admin API: `/que/admin/*` is for an admin alone, and reads the runtime's control plane. A request with no
 * identity gets 401; one from a member gets 403, on every admin path.
 */

import { Hono } from "hono";
import { OpFailed } from "@mku1tra/que-plugin";
import type { User } from "@que/users";
import { access } from "../access/connections.js";
import { control } from "../access/control.js";
import { users } from "../access/users.js";
import { plugins } from "../mount/mounted.js";
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
  // An id that is no uuid makes the store's query throw: to this route it is a user that is not there.
  const user = await users.get(id).catch(() => undefined);
  if (!user) return c.json({ error: "not found" }, 404);
  try {
    await control.grant(id, c.req.param("domain"), c.get("userId"));
  } catch (error) {
    if (error instanceof Error) return c.json({ error: error.message }, 400);
    throw error;
  }
  return c.json({ ok: true });
});

// An admin's own role is not theirs to take: a deployment always keeps one.
// A role that is neither admin nor member is a 400; a user that is not there, or an id that is no uuid, a 404.
admin.patch("/que/admin/users/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => undefined)) as
    { role?: User["role"] } | undefined;
  const role = body?.role;
  if (role !== "admin" && role !== "member")
    return c.json({ error: "role must be admin or member" }, 400);
  if (id === c.get("userId") && role !== "admin")
    return c.json({ error: "You cannot take your own admin role" }, 409);
  // An id that is no uuid makes the store's query throw: to this route it is a user that is not there.
  const user = await users.setRole(id, role).catch(() => undefined);
  if (!user) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// A revoke of a user or a domain that is not there changes nothing, and answers as a revoke does.
admin.delete("/que/admin/users/:id/grants/:domain", async (c) => {
  await control.revoke(c.req.param("id"), c.req.param("domain"));
  return c.json({ ok: true });
});

// A login is of an internal connector's role, kept under `role:<role>`: no user's own. A connector that is not mounted,
// one with no roles, and a role it does not list are 404s that name what is wrong.
const rolePlugin = async (name: string, role: string) => {
  const mounted = plugins.find((p) => p.definition.plugin.name === name);
  if (!mounted) return `${name} is not mounted`;
  const held = (await control.roles()).find((c) => c.name === name);
  if (!held) return `${name} is no internal connector`;
  if (!held.roles.includes(role)) return `${name} has no role ${role}`;
  return mounted.definition.plugin;
};

// A login the schema refuses is a 400; one whose connect fails is a 502, since the fault is not the request.
admin.put("/que/admin/logins/:connector/:role", async (c) => {
  const name = c.req.param("connector");
  const role = c.req.param("role");
  const found = await rolePlugin(name, role);
  if (typeof found === "string") return c.json({ error: found }, 404);
  try {
    await access.setCredential(
      found,
      `role:${role}`,
      (await c.req.json().catch(() => undefined))?.values,
    );
  } catch (error) {
    if (error instanceof OpFailed) return c.json({ error: error.message }, 400);
    if (error instanceof Error)
      return c.json({ error: `${name}: ${error.message}` }, 502);
    throw error;
  }
  return c.json({ ok: true });
});

// One role of each internal connector, and whether its login is set. Never a value.
admin.get("/que/admin/logins", async (c) =>
  c.json(
    await Promise.all(
      (await control.roles()).flatMap(({ name, roles }) =>
        roles.map(async (role) => ({
          connector: name,
          role,
          set: (await access.connectedPlugins(`role:${role}`)).has(name),
        })),
      ),
    ),
  ),
);

// A role with no login removes nothing, and answers as one that has.
admin.delete("/que/admin/logins/:connector/:role", async (c) => {
  const name = c.req.param("connector");
  const role = c.req.param("role");
  const found = await rolePlugin(name, role);
  if (typeof found === "string") return c.json({ error: found }, 404);
  await access.removeCredential(found, `role:${role}`);
  return c.json({ ok: true });
});
