/**
 * The thread routes, mounted at /threads: a user makes, lists and opens their
 * own threads, and runs, joins and stops them (run/runs.ts). A thread says
 * whether its run goes: a join gives the rest of it. Another user's thread
 * gets the same 404 as one that is not there, so no answer says that it exists.
 */

import { Hono } from "hono";
import { createStore } from "@que/threads";
import { messages } from "../runner/pi/harness.js";
import { goes, runs } from "./runs.js";
import { signedIn, type SignedIn } from "./signed-in.js";

const store = createStore();

export const threads = new Hono<SignedIn>();

threads.use(signedIn);

threads.post("/", async (c) => c.json(await store.make(c.get("userId")), 201));

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

threads.route("/", runs(store));
