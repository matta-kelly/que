/**
 * Connections API, served by que's server (serve.ts). Lists plugins that
 * need a credential and whether the user has connected them; saves and
 * removes credentials.
 * Credential values are never returned.
 *
 * The caller is the signed-in user (run/signed-in.ts). Also serves
 * the signed-in user's profile with their own instructions, the user list, and what the deployment lists:
 * the agents and models a run can name.
 */

import { Hono } from "hono";
import { OpFailed } from "@mku1tra/que-plugin";
import { agents, loops, models, plugins } from "../mount/mounted.js";
import { access } from "../access/connections.js";
import { control } from "../access/control.js";
import { accepted } from "../access/instructions.js";
import { instructionsFile, userInstructions, users } from "../access/users.js";
import { chatEnabled } from "./chat.js";
import { deploymentInfo } from "./deployment-info.js";
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

// The user's row, with their instructions in use and where those are from.
const profile = async (userId: string) => {
  const [me, { text, from }] = await Promise.all([
    users.get(userId),
    userInstructions(userId),
  ]);
  return me && { ...me, instructions: text, instructionsFrom: from };
};

app.get("/que/me", async (c) => {
  const me = await profile(c.get("userId"));
  return me ? c.json(me) : c.json({ error: "not found" }, 404);
});

app.patch("/que/me", async (c) => {
  const { name, avatarUrl, instructions } = (await c.req.json()) as {
    name?: string;
    avatarUrl?: string | null;
    instructions?: unknown;
  };
  const change =
    instructions === undefined
      ? undefined
      : accepted(instructions, instructionsFile ? "file" : "account");
  if (change && "error" in change)
    return c.json({ error: change.error }, change.status);
  // Pictures are small data URLs made in the browser (or a plain https link).
  if (
    avatarUrl &&
    (!/^(data:image\/|https:\/\/)/.test(avatarUrl) ||
      avatarUrl.length > 300_000)
  ) {
    return c.json({ error: "picture must be an image under ~300 KB" }, 400);
  }
  await users.update(c.get("userId"), {
    name,
    avatarUrl,
    instructions: change?.text,
  });
  return c.json(await profile(c.get("userId")));
});

app.get("/que/users", async (c) => c.json(await users.list()));

// The same for every user: what the deployment lists, fixed at mount, and whether it serves the chat.
app.get("/que/deployment", (c) =>
  c.json(deploymentInfo(agents, models, loops, chatEnabled())),
);
