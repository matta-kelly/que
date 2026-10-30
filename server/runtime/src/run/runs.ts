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
 * GET /threads/:id/join gives a viewer the thread's run while it goes: the
 * stream it gives the client that sent it, with a MESSAGES_SNAPSHOT of the
 * chat before the run after its RUN_STARTED, so a client that reloads, or a
 * second viewer, holds the same chat, under the same ids, as the one that sent
 * it. A thread with no run going is joined as a run that ended: RUN_STARTED,
 * the chat, RUN_FINISHED. A join holds the runs this process streams.
 *
 * The thread runs the agent config it picks (run/threads.ts), else the
 * deployment's first, on the model it picks, else the agent's, with the ops
 * of the agent's plugins that the signed-in user can reach, as that user.
 */

import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  contentToText,
  EventType,
  type AGUIEvent,
  type Message,
} from "@ag-ui/core";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import type { ThreadStore } from "@que/threads";
import { catalogFor } from "../access/catalog.js";
import { narrow } from "../access/narrow.js";
import { agents, models } from "../mount/mounted.js";
import { messages, run, running, stop } from "../runner/pi/harness.js";
import { configFor } from "./config.js";
import { modelFor } from "./model.js";
import type { SignedIn } from "./signed-in.js";

/** A run that goes, as its viewers get it: its user message, the events it has given, and each viewer that joined. */
type Going = {
  asked: Message;
  events: AGUIEvent[];
  viewers: Set<(event: AGUIEvent) => void>;
};

/** Each thread's run that goes, by the thread's id. */
const going = new Map<string, Going>();

/** Whether the thread's run goes: a join gives its stream. */
export const goes = (thread: string) => going.has(thread);

const ends = (event: AGUIEvent) =>
  event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR;

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
    const config = configFor(agents, thread.agent ?? undefined);
    const model = modelFor(models, config, thread.model ?? undefined);
    const catalog = narrow(await catalogFor(user), config.plugins ?? []);
    await store.setStopped(threadId, false);

    return streamSSE(c, async (sse) => {
      const mine: Going = {
        asked: {
          id: last.id,
          role: "user",
          content: contentToText(last.content),
        },
        events: [],
        viewers: new Set(),
      };
      going.set(threadId, mine);
      // Each event is kept, and given to each viewer, before it is written to the client that sent the run.
      const send = (event: AGUIEvent) => {
        mine.events.push(event);
        for (const viewer of mine.viewers) viewer(event);
        if (ends(event) && going.get(threadId) === mine) going.delete(threadId);
        return sse.writeSSE({ data: JSON.stringify(event) });
      };
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

  routes.get("/:id/join", async (c) => {
    const thread = await store.get(c.get("userId"), c.req.param("id"));
    if (!thread) return c.json({ error: "not found" }, 404);
    const threadId = thread.id;
    return streamSSE(c, async (sse) => {
      const send = (event: AGUIEvent) =>
        sse.writeSSE({ data: JSON.stringify(event) });
      const run = going.get(threadId);
      if (!run) {
        const runId = randomUUID();
        await send({ type: EventType.RUN_STARTED, threadId, runId });
        await send({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: await messages(threadId),
        });
        await send({ type: EventType.RUN_FINISHED, threadId, runId });
        return;
      }
      // The events so far, and each one after, in the order the run gave them: the copy and the watch start at once.
      const queue = [...run.events];
      let wake = () => {};
      const viewer = (event: AGUIEvent) => {
        queue.push(event);
        wake();
      };
      run.viewers.add(viewer);
      sse.onAbort(() => wake());
      try {
        // The chat before the run: the thread's, to the run's user message, or with it, when it is not placed yet.
        const chat = await messages(threadId);
        const at = chat.findIndex((m) => m.id === run.asked.id);
        // The run's first event is its RUN_STARTED.
        await send(queue.shift()!);
        await send({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: at < 0 ? [...chat, run.asked] : chat.slice(0, at + 1),
        });
        while (!sse.aborted) {
          const event = queue.shift();
          if (!event) {
            await new Promise<void>((woken) => (wake = woken));
            continue;
          }
          await send(event);
          if (ends(event)) return;
        }
      } finally {
        run.viewers.delete(viewer);
      }
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
