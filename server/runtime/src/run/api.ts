/**
 * Connections API, served by que's server (serve.ts). Lists plugins that
 * need a credential and whether the user has connected them; saves and
 * removes credentials.
 * Credential values are never returned.
 *
 * The caller is the signed-in user (run/signed-in.ts). Also serves
 * the signed-in user's profile and the user list.
 */

import { Hono } from "hono";
import { OpFailed } from "@mku1tra/que-plugin";
import { plugins } from "../mount/mounted.js";
import { access } from "../access/connections.js";
import { control } from "../access/control.js";
import { users } from "../access/users.js";
import { signedIn, type SignedIn } from "./signed-in.js";

export const app = new Hono<SignedIn>();

app.use("/que/*", signedIn);

const find = (name: string) =>
  plugins.find((p) => p.definition.plugin.name === name)?.definition.plugin;
const isSecret = (field: string) => /key|password|secret|token/i.test(field);

app.get("/que/connections", async (c) => {
  const connected = await access.connectedPlugins(c.get("userId"));
  const reach = await control.reachOf(c.get("userId"));
  return c.json(
    plugins
      .filter((p) => p.definition.plugin.credential)
      .flatMap(({ definition: { plugin } }) => {
        const reached = reach.connectors.find((x) => x.name === plugin.name);
        if (reached === undefined) return [];
        const entry = {
          name: plugin.name,
          title: plugin.title,
          description: plugin.description,
          connectedAt: connected.get(plugin.name) ?? null,
        };
        // An internal connector is reached with a role, not the user's own credential.
        if (reached.login !== "own")
          return [{ ...entry, roles: reached.login.roles, fields: [] }];
        return [
          {
            ...entry,
            fields: Object.keys(plugin.credential!.shape).map((name) => ({
              name,
              secret: isSecret(name),
            })),
          },
        ];
      }),
  );
});

// The domains the user holds, with the connectors and roles each names.
app.get("/que/domains", async (c) => {
  const reach = await control.reachOf(c.get("userId"));
  const held = new Set(reach.domains);
  return c.json((await control.domains()).filter((d) => held.has(d.name)));
});

app.put("/que/connections/:plugin", async (c) => {
  const plugin = find(c.req.param("plugin"));
  if (!plugin) return c.json({ error: "unknown plugin" }, 404);
  const reached = (await control.reachOf(c.get("userId"))).connectors.find(
    (x) => x.name === plugin.name,
  );
  if (reached === undefined)
    return c.json({ error: `${plugin.name} is not reached` }, 403);
  if (reached.login !== "own")
    return c.json({ error: `${plugin.name} is internal` }, 403);
  try {
    await access.setCredential(
      plugin,
      c.get("userId"),
      (await c.req.json().catch(() => undefined))?.values,
    );
  } catch (error) {
    if (error instanceof OpFailed) return c.json({ error: error.message }, 400);
    throw error;
  }
  return c.json({ ok: true });
});

app.delete("/que/connections/:plugin", async (c) => {
  const plugin = find(c.req.param("plugin"));
  if (!plugin) return c.json({ error: "unknown plugin" }, 404);
  await access.removeCredential(plugin, c.get("userId"));
  return c.json({ ok: true });
});

app.get("/que/me", async (c) => {
  const me = await users.get(c.get("userId"));
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
  await users.update(c.get("userId"), { name, avatarUrl });
  return c.json(await users.get(c.get("userId")));
});

app.get("/que/users", async (c) => c.json(await users.list()));
