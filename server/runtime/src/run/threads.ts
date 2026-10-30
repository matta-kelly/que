/**
 * The thread routes, mounted at /threads: a user makes, lists and opens their
 * own threads, renames, archives and deletes them, picks the agent config and
 * the model their runs take, and runs, joins and stops them (run/runs.ts). A
 * thread says whether its run goes: a join gives the rest of it. A delete
 * stops the thread's run first, if one goes. A pick is
 * made on PATCH /threads/:id, or on POST /threads before the thread exists; it
 * names an agent or a model the deployment lists, or is null to follow the
 * deployment's first agent and the agent's model. Another user's thread gets
 * the same 404 as one that is not there, so no answer says that it exists.
 */

import { Hono } from "hono";
import * as z from "zod";
import { createStore } from "@que/threads";
import { agents, models } from "../mount/mounted.js";
import { messages, stop } from "../runner/pi/harness.js";
import { goes, runs } from "./runs.js";
import { signedIn, type SignedIn } from "./signed-in.js";

const store = createStore();

export const threads = new Hono<SignedIn>();

threads.use(signedIn);

const pick = {
  agent: z
    .enum(agents.map((agent) => agent.name))
    .nullable()
    .optional(),
  model: z
    .enum(models.map((model) => model.name))
    .nullable()
    .optional(),
};
const Pick = z.object(pick);
const Change = z.object({
  title: z.string().optional(),
  archived: z.boolean().optional(),
  ...pick,
});

/** The request's body, read by `schema`: an empty body is `{}`, a change of nothing. */
async function bodyOf<T>(text: Promise<string>, schema: z.ZodType<T>) {
  const body = await text;
  let json: unknown;
  try {
    json = body === "" ? {} : JSON.parse(body);
  } catch {
    return { error: "the body is not JSON" };
  }
  const read = schema.safeParse(json);
  return read.success
    ? { data: read.data }
    : { error: z.prettifyError(read.error) };
}

threads.post("/", async (c) => {
  const { data, error } = await bodyOf(c.req.text(), Pick);
  if (!data) return c.json({ error }, 400);
  return c.json(await store.make(c.get("userId"), data), 201);
});

threads.get("/", async (c) => c.json(await store.list(c.get("userId"))));

threads.get("/:id", async (c) => {
  const thread = await store.get(c.get("userId"), c.req.param("id"));
  return thread
    ? c.json({
        ...thread,
        messages: await messages(thread.id),
        running: goes(thread.id),
      })
    : c.json({ error: "not found" }, 404);
});

threads.patch("/:id", async (c) => {
  const { data, error } = await bodyOf(c.req.text(), Change);
  if (!data) return c.json({ error }, 400);
  // The change is made only on the user's own thread: none, for any other.
  const changed = await store.change(c.get("userId"), c.req.param("id"), data);
  return changed ? c.json(changed) : c.json({ error: "not found" }, 404);
});

threads.delete("/:id", async (c) => {
  const user = c.get("userId");
  const thread = await store.get(user, c.req.param("id"));
  if (!thread) return c.json({ error: "not found" }, 404);
  // A run that goes is stopped first, so it ends on a thread that is still there.
  await stop(thread.id);
  return (await store.remove(user, thread.id))
    ? c.body(null, 204)
    : c.json({ error: "not found" }, 404);
});

threads.route("/", runs(store));
