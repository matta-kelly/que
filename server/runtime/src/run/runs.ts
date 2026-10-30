/**
 * The run route, on the thread routes: POST /threads/:id/runs takes AG-UI's
 * RunAgentInput, sends its last message on the conversation its messages
 * choose by the branch rule (runner/pi/branch.ts), and streams the answer back
 * as AG-UI events over SSE. A resend of a run makes no second run: its stream
 * is RUN_STARTED then RUN_FINISHED. A client that drops its
 * connection does not stop the run: stopping is a call of its own,
 * POST /threads/:id/stop, which ends the run with RUN_FINISHED and marks the
 * thread stopped until its next run; a stop when no run goes marks nothing.
 * Its answer says which: `{ stopped }`. A run whose model call fails ends with
 * RUN_ERROR, in the place of RUN_FINISHED.
 *
 * The thread runs the deployment's first agent, on its model, with the ops
 * of its plugins that the signed-in user can reach, as that user.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { contentToText, EventType, type AGUIEvent } from "@ag-ui/core";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import type { ThreadStore } from "@que/threads";
import { catalogFor } from "../access/catalog.js";
import { narrow } from "../access/narrow.js";
import { agents, models } from "../mount/mounted.js";
import { run, running, stop } from "../runner/pi/harness.js";
import { configFor } from "./config.js";
import { modelFor } from "./model.js";
import type { SignedIn } from "./signed-in.js";

export function runs(store: ThreadStore) {
  const routes = new Hono<SignedIn>();

  routes.post("/:id/runs", async (c) => {
    const user = c.get("userId");
    const thread = await store.get(user, c.req.param("id"));
    if (!thread) return c.json({ error: "not found" }, 404);
    const input = RunAgentInputSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!input.success)
      return c.json({ error: "the body is not a RunAgentInput" }, 400);
    const { runId, messages } = input.data;
    // The run is on the thread the URL names, whatever thread the body names.
    const threadId = thread.id;
    const last = messages.at(-1);
    if (last?.role !== "user")
      return c.json({ error: "the last message is not the user's" }, 400);
    const config = configFor(agents, undefined);
    const model = modelFor(models, config, undefined);
    const catalog = narrow(await catalogFor(user), config.plugins ?? []);
    await store.setStopped(threadId, false);

    return streamSSE(c, async (sse) => {
      const send = (event: AGUIEvent) =>
        sse.writeSSE({ data: JSON.stringify(event) });
      await send({ type: EventType.RUN_STARTED, threadId, runId });
      // A run that cannot start (its conversation, its watch or its submission fails) ends with RUN_ERROR too.
      const { error } = await run(
        threadId,
        model,
        { catalog, user, agent: config.name },
        {
          runId,
          before: messages.slice(0, -1).map((m) => m.id),
          last: { id: last.id, content: contentToText(last.content) },
        },
        send,
      ).catch((failed: Error) => ({ error: failed.message }));
      await send(
        error === undefined
          ? { type: EventType.RUN_FINISHED, threadId, runId }
          : { type: EventType.RUN_ERROR, message: error },
      );
    });
  });

  routes.post("/:id/stop", async (c) => {
    const thread = await store.get(c.get("userId"), c.req.param("id"));
    if (!thread) return c.json({ error: "not found" }, 404);
    // A thread whose run had ended is not stopped: its reply is whole. The mark comes before the stop, so the run's
    // stream ends on a thread that says it.
    const stopped = await running(thread.id);
    if (stopped) await store.setStopped(thread.id, true);
    await stop(thread.id);
    return c.json({ stopped });
  });

  return routes;
}
