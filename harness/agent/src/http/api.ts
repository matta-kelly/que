/**
 * Connections API, served by the LangGraph server alongside the agent
 * (langgraph.json → http.app). Lists packages that need a credential and
 * whether the rep has connected them; saves and removes credentials.
 * Credential values are never returned.
 *
 * The caller is the user resolved by the auth hook (src/http/auth.ts). Also serves
 * the signed-in user's profile and the user list.
 */

import { Hono, type Context } from "hono";
import { OperationFailed } from "@que/core";
import { packages } from "../mount/packages.js";
import {
  connectedPackages,
  removeCredential,
  setCredential,
} from "../mount/credentials.js";
import { users } from "../users.js";

export const app = new Hono();

// The signed-in user's id, set by the LangGraph auth hook.
const repOf = (c: Context) =>
  (c.get("auth" as never) as { user: { identity: string } }).user.identity;
const find = (name: string) =>
  packages.find((p) => p.definition.name === name)?.definition;
const isSecret = (field: string) => /key|password|secret|token/i.test(field);

app.get("/que/connections", async (c) => {
  const connected = await connectedPackages(repOf(c));
  return c.json(
    packages
      .filter((p) => p.definition.credential)
      .map(({ definition: pkg }) => ({
        name: pkg.name,
        title: pkg.title,
        description: pkg.description,
        fields: Object.keys(pkg.credential!.shape).map((name) => ({
          name,
          secret: isSecret(name),
        })),
        connectedAt: connected.get(pkg.name) ?? null,
      })),
  );
});

app.put("/que/connections/:package", async (c) => {
  const pkg = find(c.req.param("package"));
  if (!pkg) return c.json({ error: "unknown package" }, 404);
  try {
    await setCredential(pkg, repOf(c), (await c.req.json()).values);
  } catch (error) {
    if (error instanceof OperationFailed)
      return c.json({ error: error.message }, 400);
    throw error;
  }
  return c.json({ ok: true });
});

app.delete("/que/connections/:package", async (c) => {
  const pkg = find(c.req.param("package"));
  if (!pkg) return c.json({ error: "unknown package" }, 404);
  await removeCredential(pkg, repOf(c));
  return c.json({ ok: true });
});

app.get("/que/me", async (c) => {
  const me = await users.get(repOf(c));
  return me ? c.json(me) : c.json({ error: "not found" }, 404);
});

app.patch("/que/me", async (c) => {
  const { name, avatarUrl } = (await c.req.json()) as {
    name?: string;
    avatarUrl?: string | null;
  };
  // Pictures are small data URLs made in the browser (or a plain https link).
  if (
    avatarUrl &&
    (!/^(data:image\/|https:\/\/)/.test(avatarUrl) ||
      avatarUrl.length > 300_000)
  ) {
    return c.json({ error: "picture must be an image under ~300 KB" }, 400);
  }
  return c.json(await users.update(repOf(c), { name, avatarUrl }));
});

app.get("/que/users", async (c) => c.json(await users.list()));
