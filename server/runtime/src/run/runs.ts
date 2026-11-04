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
 * An op that needs a yes stops the stream, not the run: the run's tool call
 * waits, and the stream ends with RUN_FINISHED whose outcome is an AG-UI
 * interrupt, `tool_call`, on that call's id, with the op and its parsed input
 * in its metadata. Every call of one tool round that asks waits for the same
 * pause: the part ends once each call of the round has asked or has run, so
 * one resume answers the round. The client answers with a new POST whose
 * `resume` answers each interrupt: `resolved` with `{ approved: true }` runs
 * the op, any other answer refuses it, and that POST streams the rest of the
 * run. A resume that also sends a new user message answers the interrupts, and
 * the new message waits for the run, as a message sent while a run goes does.
 * A stop, or the thread's delete, refuses each call that waits. A restart of
 * the server ends the wait with the run's other work: what pi does with a tool
 * call it cut off.
 *
 * GET /threads/:id/join gives a viewer the thread's run while it goes: the
 * stream it gives the client that sent it, with a MESSAGES_SNAPSHOT of the
 * chat before the run after its RUN_STARTED, so a client that reloads, or a
 * second viewer, holds the same chat, under the same ids, as the one that sent
 * it. A thread with no run going is joined as a run that ended: RUN_STARTED,
 * the chat, RUN_FINISHED. A join holds the runs this process streams. A join
 * of a run that waits for a yes gives the stream that ended on it, and one
 * after its resume gives the stream of the resume, with the chat before it.
 *
 * The thread runs the agent config it picks (run/threads.ts), else the
 * deployment's first, on the model it picks, else the agent's, with the ops
 * of the agent's plugins that the signed-in user can reach, as that user, and
 * the agent's system prompt for that user: who they are, their own
 * instructions if the agent takes them, and the agent's instructions. Its
 * `loading` (run/loading.ts) says how the prompt shows the plugins, and when
 * the model is offered an op: from the first request, or once it loads it.
 * The tags of its input's forwardedProps that que knows go on its trace
 * (run/trace.ts): "eval" marks a run of the eval runner.
 */

import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  contentToText,
  EventType,
  type AGUIEvent,
  type Interrupt,
  type Message,
  type ResumeEntry,
} from "@ag-ui/core";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import type { ThreadStore } from "@que/threads";
import type { Ask, Decision } from "../assemble/door.js";
import { catalogFor } from "../access/catalog.js";
import { taken } from "../access/instructions.js";
import { narrow } from "../access/narrow.js";
import { userInstructions } from "../access/users.js";
import { agents, loops, models } from "../mount/mounted.js";
import { messages, run, running, stop } from "../runner/pi/harness.js";
import { configFor } from "./config.js";
import { loadingFor } from "./loading.js";
import { loopFor } from "./loop.js";
import { modelFor } from "./model.js";
import type { SignedIn } from "./signed-in.js";
import { tagsOf } from "./trace.js";

/** A yes a run waits for: the interrupt it is asked as, and how the call gets the answer. */
type Asking = { interrupt: Interrupt; answer: (decision: Decision) => void };

/**
 * A run that goes, as its viewers get it. Its stream is one AG-UI run, or one for each part when it stops for a yes:
 * - `threadId`, and `runId`: the AG-UI run of the part
 * - `asked`: the chat's last message before the part, the user's message first, and `placed`: whether the chat holds it
 * - `events`: the part's events so far, and `viewers`: each viewer that joined
 * - `client`: the stream of the client that sent the part, while it is open
 * - `asking`: the yeses the part ended on, by interrupt id
 * - `round`: the tool round the run is in, whose asks wait until every call of
 *   it has asked or has its result, so the part ends on the round's batch
 */
type Going = {
  threadId: string;
  runId: string;
  asked: Message;
  placed: boolean;
  events: AGUIEvent[];
  viewers: Set<(event: AGUIEvent) => void>;
  client?: { write: (event: AGUIEvent) => Promise<unknown>; end: () => void };
  asking: Map<string, Asking>;
  round: {
    /** The round's call ids, as its response named them. */
    calls: Set<string>;
    /** The calls of the round that have their result. */
    results: Set<string>;
    /** The asks of the round that wait in it, by call id. */
    asks: Map<string, Asking>;
  };
};

/** Each thread's run that goes, by the thread's id. */
const going = new Map<string, Going>();

/** Whether the thread's run goes: a join gives its stream. */
export const goes = (thread: string) => going.has(thread);

/** The interrupts the thread's run waits on: none when no run goes, or when it waits for nothing. */
export const waiting = (thread: string): Interrupt[] =>
  [...(going.get(thread)?.asking.values() ?? [])].map((a) => a.interrupt);

/** Refuses each call of the thread's run that waits for a yes: a stop, and a delete, end the wait. */
export function refuseWaiting(thread: string) {
  const run = going.get(thread);
  if (!run) return;
  const all = [...run.asking.values(), ...run.round.asks.values()];
  run.asking = new Map();
  run.round.asks.clear();
  for (const asking of all) asking.answer({ type: "reject" });
}

const ends = (event: AGUIEvent) =>
  event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR;

/** Whether an event ends a part on an interrupt: the run goes on, and waits. */
const pauses = (event: AGUIEvent) =>
  event.type === EventType.RUN_FINISHED && event.outcome?.type === "interrupt";

/**
 * Gives an event of the run: kept, and given to each viewer, before it is written to the client of the part. An event
 * that ends the part ends the client's stream, and one that ends the run ends the run's place in `going`.
 */
async function emit(run: Going, event: AGUIEvent) {
  run.events.push(event);
  for (const viewer of run.viewers) viewer(event);
  if (ends(event) && !pauses(event) && going.get(run.threadId) === run)
    going.delete(run.threadId);
  const client = run.client;
  if (ends(event)) run.client = undefined;
  await client?.write(event);
  if (ends(event)) client?.end();
}

/** Ends the run's part on the interrupts of `asks`: the run waits for their answers. */
function pause(run: Going, asks: Asking[]) {
  run.round.asks.clear();
  for (const asking of asks) run.asking.set(asking.interrupt.id, asking);
  return emit(run, {
    type: EventType.RUN_FINISHED,
    threadId: run.threadId,
    runId: run.runId,
    outcome: { type: "interrupt", interrupts: asks.map((a) => a.interrupt) },
  });
}

/**
 * Ends the run's part on its round's asks, once every call of the round has asked or has its result: one pause holds
 * the batch, and none goes out while a call the UI cannot answer still runs.
 */
function settle(run: Going) {
  const { calls, results, asks } = run.round;
  if (!asks.size || !calls.size) return;
  for (const call of calls) if (!asks.has(call) && !results.has(call)) return;
  void pause(run, [...asks.values()]);
}

/**
 * The run's ask: a yes for a flagged op is an interrupt on its tool call, with the op, its parsed input and the
 * allowed decisions. It waits in its round until every call of the round has asked or has its result, and then the
 * round's asks end the part together. The interrupt's message is the request's description.
 */
const askOf =
  (run: Going): Ask =>
  (request, { plugin, op }) =>
    new Promise<Decision>((answer) => {
      const asking: Asking = {
        interrupt: {
          id: randomUUID(),
          reason: request.callId ? "tool_call" : "confirmation",
          ...(request.callId ? { toolCallId: request.callId } : {}),
          message: request.description,
          metadata: {
            plugin: plugin.name,
            op: op.name,
            input: request.args,
          },
        },
        answer,
      };
      const call = request.callId ?? asking.interrupt.id;
      // An ask with no call id is a call of its own, so it can end the part on its own.
      if (request.callId === undefined) run.round.calls.add(call);
      run.round.asks.set(call, asking);
      settle(run);
    });

/**
 * The decision a resume gives: `approved: true` is approve, and any other answer is a reject. The cut that carries
 * edit and respond in the chat's payload is `approval-decisions`, and it widens this.
 */
const decisionOf = (entry: ResumeEntry): Decision =>
  entry.status === "resolved" &&
  typeof entry.payload === "object" &&
  entry.payload !== null &&
  (entry.payload as { approved?: unknown }).approved === true
    ? { type: "approve" }
    : { type: "reject" };

/** An SSE stream as a part's client: what it writes, and the end the stream waits for. */
function clientOf(sse: { writeSSE: (m: { data: string }) => Promise<void> }) {
  let end!: () => void;
  const ended = new Promise<void>((resolve) => (end = resolve));
  return {
    client: {
      write: (event: AGUIEvent) =>
        sse.writeSSE({ data: JSON.stringify(event) }),
      end,
    },
    ended,
  };
}

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
    const { runId, messages: sent, forwardedProps, resume } = input.data;
    // The run is on the thread the URL names, whatever thread the body names.
    const threadId = thread.id;
    const last = sent.at(-1);
    if (resume?.length) {
      const run = going.get(threadId);
      const ids = new Set(resume.map((entry) => entry.interruptId));
      if (!run?.asking.size)
        return c.json(
          { error: "no run of this thread waits for an answer" },
          409,
        );
      if (
        ids.size !== resume.length ||
        ids.size !== run.asking.size ||
        [...run.asking.keys()].some((id) => !ids.has(id))
      )
        return c.json(
          {
            error:
              "the resume does not answer each interrupt the run waits on, once",
          },
          400,
        );
      if (last?.role !== "user") {
        await store.setStopped(threadId, false);
        const chat = await messages(threadId);
        return streamSSE(c, async (sse) => {
          const { client, ended } = clientOf(sse);
          const asking = run.asking;
          run.asking = new Map();
          run.runId = runId;
          run.events = [];
          run.placed = true;
          run.asked = chat.at(-1) ?? run.asked;
          run.client = client;
          await emit(run, { type: EventType.RUN_STARTED, threadId, runId });
          for (const entry of resume)
            asking.get(entry.interruptId)?.answer(decisionOf(entry));
          await ended;
        });
      }
      // A new message with the answers: the run they answer goes on, and the message waits for it.
      const asking = run.asking;
      run.asking = new Map();
      for (const entry of resume)
        asking.get(entry.interruptId)?.answer(decisionOf(entry));
    }
    if (last?.role !== "user")
      return c.json({ error: "the last message is not the user's" }, 400);
    const config = configFor(agents, thread.agent ?? undefined);
    const model = modelFor(models, config, thread.model ?? undefined);
    const loop = loopFor(loops, config);
    const catalog = narrow(await catalogFor(user), config.plugins ?? []);
    // Their own text, if the agent takes it: a file the deployment names is read only then.
    const own = config.userInstructions
      ? (await userInstructions(user)).text
      : undefined;
    await store.setStopped(threadId, false);

    return streamSSE(c, async (sse) => {
      const { client, ended } = clientOf(sse);
      const mine: Going = {
        threadId,
        runId,
        asked: {
          id: last.id,
          role: "user",
          content: contentToText(last.content),
        },
        placed: false,
        events: [],
        viewers: new Set(),
        client,
        asking: new Map(),
        round: { calls: new Set(), results: new Set(), asks: new Map() },
      };
      going.set(threadId, mine);
      const send = (event: AGUIEvent) => emit(mine, event);
      await send({ type: EventType.RUN_STARTED, threadId, runId });
      // The run outlives this stream when it waits for a yes: its end is sent to the part that goes then, if any.
      // A run that cannot start (its conversation, its watch or its submission fails) ends with RUN_ERROR too.
      void run(
        threadId,
        model,
        {
          catalog,
          user,
          agent: config.name,
          tags: tagsOf(forwardedProps),
          prompt: {
            user: { ...c.get("user"), instructions: taken(config, own) },
            instructions: config.instructions,
          },
          way: loadingFor(config),
          result: loop.result,
          summarize: loop.summarize,
          ask: askOf(mine),
          round: {
            called: (callIds) => {
              mine.round.calls = new Set(callIds);
              mine.round.results = new Set();
              settle(mine);
            },
            result: (callId) => {
              mine.round.results.add(callId);
              settle(mine);
            },
          },
        },
        {
          runId,
          before: sent.slice(0, -1).map((m) => m.id),
          last: { id: last.id, content: contentToText(last.content) },
        },
        send,
      )
        .catch((failed: Error) => ({ error: failed.message }))
        .then(({ error }) => {
          // A call that still waits has no run to answer: it is refused.
          refuseWaiting(threadId);
          return send(
            error === undefined
              ? { type: EventType.RUN_FINISHED, threadId, runId: mine.runId }
              : { type: EventType.RUN_ERROR, message: error },
          );
        })
        .catch((failed: Error) =>
          console.error("que: the run's end was not sent:", failed.message),
        );
      await ended;
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
        const before =
          at >= 0
            ? chat.slice(0, at + 1)
            : run.placed
              ? chat
              : [...chat, run.asked];
        // The run's first event is its RUN_STARTED.
        await send(queue.shift()!);
        await send({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: before,
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
    refuseWaiting(thread.id);
    await stop(thread.id);
    return c.json({ stopped });
  });

  return routes;
}
