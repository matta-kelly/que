/**
 * The run route, on the thread routes: POST /threads/:id/runs takes AG-UI's
 * RunAgentInput, sends its last message on the thread's conversation, and
 * streams the answer back as AG-UI events over SSE. A client that drops its
 * connection does not stop the run: stopping is a call of its own.
 *
 * The thread runs the deployment's first agent, on its model.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { contentToText, EventType, type AGUIEvent } from "@ag-ui/core";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import type { ThreadStore } from "@que/threads";
import { agents, models } from "../mount/mounted.js";
import { run } from "../runner/pi/harness.js";
import { configFor } from "./config.js";
import { modelFor } from "./model.js";
import type { SignedIn } from "./signed-in.js";

export function runs(store: ThreadStore) {
  const routes = new Hono<SignedIn>();

  routes.post("/:id/runs", async (c) => {
    const thread = await store.get(c.get("userId"), c.req.param("id"));
    if (!thread) return c.json({ error: "not found" }, 404);
    const { threadId, runId, messages } = RunAgentInputSchema.parse(
      await c.req.json(),
    );
    const last = messages.at(-1);
    if (last?.role !== "user")
      return c.json({ error: "the last message is not the user's" }, 400);
    const model = modelFor(models, configFor(agents, undefined), undefined);

    return streamSSE(c, async (sse) => {
      const send = (event: AGUIEvent) =>
        sse.writeSSE({ data: JSON.stringify(event) });
      await send({ type: EventType.RUN_STARTED, threadId, runId });
      await run(
        thread.id,
        model,
        { id: last.id, content: contentToText(last.content) },
        send,
      );
      await send({ type: EventType.RUN_FINISHED, threadId, runId });
    });
  });

  return routes;
}
