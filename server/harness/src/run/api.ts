/**
 * Connections API, served by the LangGraph server alongside the agent
 * (langgraph.json → http.app). Lists plugins that need a credential and
 * whether the user has connected them; saves and removes credentials.
 * Credential values are never returned.
 *
 * The caller is the user resolved by the auth hook (src/run/auth.ts). Also serves
 * the signed-in user's profile with their own instructions, the user list, and what the deployment lists:
 * the agents and models a run can name.
 */

import { Hono, type Context } from "hono";
import { OperationFailed } from "@que/core";
import { agents, loops, models, plugins } from "../mount/mounted.js";
import {
  connectedPlugins,
  removeCredential,
  setCredential,
} from "../access/connections.js";
import { accepted } from "../access/instructions.js";
import { instructionsFile, userInstructions, users } from "../access/users.js";
import { deploymentInfo } from "./deployment-info.js";

export const app = new Hono();

// The signed-in user's id, set by the LangGraph auth hook.
const userIdOf = (c: Context) =>
  (c.get("auth" as never) as { user: { identity: string } }).user.identity;
const find = (name: string) =>
  plugins.find((p) => p.definition.name === name)?.definition;
const isSecret = (field: string) => /key|password|secret|token/i.test(field);

app.get("/que/connections", async (c) => {
  const connected = await connectedPlugins(userIdOf(c));
  return c.json(
    plugins
      .filter((p) => p.definition.credential)
      .map(({ definition: plugin }) => ({
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

app.put("/que/connections/:package", async (c) => {
  const plugin = find(c.req.param("package"));
  if (!plugin) return c.json({ error: "unknown package" }, 404);
  try {
    await setCredential(plugin, userIdOf(c), (await c.req.json()).values);
  } catch (error) {
    if (error instanceof OperationFailed)
      return c.json({ error: error.message }, 400);
    throw error;
  }
  return c.json({ ok: true });
});

app.delete("/que/connections/:package", async (c) => {
  const plugin = find(c.req.param("package"));
  if (!plugin) return c.json({ error: "unknown package" }, 404);
  await removeCredential(plugin, userIdOf(c));
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
  const me = await profile(userIdOf(c));
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
  await users.update(userIdOf(c), {
    name,
    avatarUrl,
    instructions: change?.text,
  });
  return c.json(await profile(userIdOf(c)));
});

app.get("/que/users", async (c) => c.json(await users.list()));

// The same for every user, and fixed at mount.
app.get("/que/deployment", (c) =>
  c.json(deploymentInfo(agents, models, loops)),
);
