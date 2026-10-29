/**
 * Connections API, served by que's server (serve.ts), and by the LangGraph
 * server alongside the agent (langgraph.json → http.app). Lists plugins that
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
import {
  connectedPlugins,
  removeCredential,
  setCredential,
} from "../access/connections.js";
import { accepted } from "../access/instructions.js";
import { instructionsFile, userInstructions, users } from "../access/users.js";
import { deploymentInfo } from "./deployment-info.js";
import { signedIn, type SignedIn } from "./signed-in.js";

export const app = new Hono<SignedIn>();

app.use("/que/*", signedIn);

const find = (name: string) =>
  plugins.find((p) => p.definition.plugin.name === name)?.definition.plugin;
const isSecret = (field: string) => /key|password|secret|token/i.test(field);

app.get("/que/connections", async (c) => {
  const connected = await connectedPlugins(c.get("userId"));
  return c.json(
    plugins
      .filter((p) => p.definition.plugin.credential)
      .map(({ definition: { plugin } }) => ({
        name: plugin.name,
        title: plugin.title,
        description: plugin.description,
        fields: Object.keys(plugin.credential!.shape).map((name) => ({
          name,
          secret: isSecret(name),
        })),
        connectedAt: connected.get(plugin.name) ?? null,
      })),
  );
});

app.put("/que/connections/:plugin", async (c) => {
  const plugin = find(c.req.param("plugin"));
  if (!plugin) return c.json({ error: "unknown plugin" }, 404);
  try {
    await setCredential(plugin, c.get("userId"), (await c.req.json()).values);
  } catch (error) {
    if (error instanceof OpFailed) return c.json({ error: error.message }, 400);
    throw error;
  }
  return c.json({ ok: true });
});

app.delete("/que/connections/:plugin", async (c) => {
  const plugin = find(c.req.param("plugin"));
  if (!plugin) return c.json({ error: "unknown plugin" }, 404);
  await removeCredential(plugin, c.get("userId"));
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

// The same for every user, and fixed at mount.
app.get("/que/deployment", (c) =>
  c.json(deploymentInfo(agents, models, loops)),
);
