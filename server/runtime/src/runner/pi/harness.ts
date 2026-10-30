/**
 * The engine's Harness: one for the server, on pi's storage in Postgres, on one
 * dedicated connection (a commit's BEGIN and COMMIT must run on one
 * connection, which a pool cannot promise), and the link from each thread to
 * its conversation is its row. The connection takes a session advisory lock
 * when this module loads, so one process owns a deployment. Each run goes on
 * the conversation the branch rule (branch.ts) chooses: the thread's, a fork of
 * it, or a new one, which the thread then points at. A new conversation gets
 * its agent then: a change to what the agent is built from takes effect from
 * the next chat, and a fork keeps its parent's. The model is the run's own:
 * a conversation on another model is moved to it. The user's catalog is read
 * at each run: each user has an extension of their own, installed again
 * with their catalog before each of their runs, and the thread's
 * conversation selects it.
 *
 * `models` is the pi-ai models collection the Harness reads at each use, with
 * Fireworks and the deployment's models on it from when this module loads.
 */

import pg from "pg";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  AssistantEntry,
  createRegistry,
  Harness,
  watchEvents,
  type Conversation,
  type ConversationId,
  type Extension,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import type { AGUIEvent } from "@ag-ui/core";
import { fireworks } from "@que/chat-model";
import { storageOn } from "@que/pi-storage";
import { createStore } from "@que/threads";
import { providerModelOf, providerOf, type Model } from "@mku1tra/que-harness";
import type { Catalog } from "../../access/catalog.js";
import { access } from "../../access/connections.js";
import { door } from "../../assemble/door.js";
import * as mounted from "../../mount/mounted.js";
import { settingsFor, tracingOnPi } from "../../run/trace.js";
import { aguiRun, heldOf, idEntry, userEntry } from "./agui.js";
import { branchOf } from "./branch.js";
import { extension } from "./extension.js";

export const models = createModels();
models.setProvider(fireworks(mounted.models));

// Every op runs through the door, on the runtime's access, with every op of every mounted plugin in reach.
const call = door(
  access.getConnection,
  mounted.plugins.flatMap(({ definition }) =>
    definition.ops.map((op) => ({ plugin: definition.plugin, op })),
  ),
);

// A run is traced when the deployment's `.env` says where to send the trace (run/trace.ts).
const tracing = tracingOnPi(settingsFor(process.env));

const registry = createRegistry();

// pi's storage runs on one connection of its own, and a session advisory lock on it says this process owns the
// deployment: the lock goes when the connection does.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
// A connection lost while nothing reads it says so with an "error" event; with no listener, node-postgres ends
// the process (node-postgres, Client).
client.on("error", (error) =>
  console.error("que: pi's storage connection was lost:", error.message),
);
await client.connect();
// The key is "que" and the deployment's number: one deployment per database.
const { rows: locks } = await client.query(
  "SELECT pg_try_advisory_lock($1, $2) AS owned",
  [0x717565, 1],
);
if (!locks[0].owned) {
  await client.end();
  throw new Error(
    "que: another process owns this deployment: its advisory lock on the database is held, so this one stops",
  );
}
const harness = await Harness.open(
  storageOn(client),
  { models, registry, telemetry: tracing.telemetry },
  context,
);

/** The thread records, and each thread's conversation, in its row. */
const threads = createStore();

/** Each thread's turn: its runs choose one at a time, in the order they came. */
const turns = new Map<string, Promise<unknown>>();

const ownership = { kind: "ownerless" } as const;

/**
 * The thread's conversation, or none: before its first run, or when its row
 * holds a value that is not a conversation's id. The row's text is the only
 * guard on the id, so a value that is not a decimal reads as no conversation.
 */
async function conversationOf(thread: string) {
  const kept = await threads.conversationOf(thread);
  const id =
    kept !== null && /^\d+$/.test(kept)
      ? (Number(kept) as ConversationId)
      : null;
  return id === null ? undefined : await harness.conversation(id, context);
}

/**
 * The conversation, on `model`: a thread whose model pick changed since its
 * conversation was made changes its conversation's model.
 */
async function onModel(conversation: Conversation, model: Model) {
  const ref = { provider: providerOf(model), modelId: providerModelOf(model) };
  const { model: had } = await conversation.agent(context);
  if (had?.provider !== ref.provider || had.modelId !== ref.modelId)
    await conversation.configure({ model: ref }, context);
  return conversation;
}

/**
 * The conversation a run goes on, chosen by the branch rule, and made the
 * thread's; with `resend`, the run is one that is made already. A thread's
 * runs choose one at a time, in the order they came. A conversation that
 * could not be made is not kept: the thread stays on the one it had.
 */
function conversationFor(
  thread: string,
  model: Model,
  que: Extension,
  input: { runId: string; before: readonly string[]; last: string },
) {
  const had = turns.get(thread) ?? Promise.resolve();
  const chosen = (async () => {
    await had.catch(() => {});
    const current = await conversationOf(thread);
    const held = current
      ? heldOf((await current.context(context)).entries)
      : [];
    const branch = branchOf(held, input);
    if (current && branch.kind === "resend")
      return { conversation: current, resend: true };
    if (current && branch.kind === "same") {
      await onModel(current, model);
      return { conversation: current, resend: false };
    }
    const conversation =
      current && branch.kind === "fork"
        ? await onModel(
            await current.fork(branch.at, { ownership }, context),
            model,
          )
        : await harness.createConversation(
            {
              ownership,
              agent: {
                model: {
                  provider: providerOf(model),
                  modelId: providerModelOf(model),
                },
                extensions: [que],
              },
            },
            context,
          );
    await threads.setConversation(thread, String(conversation.id));
    return { conversation, resend: false };
  })();
  turns.set(
    thread,
    chosen.catch(() => undefined),
  );
  return chosen;
}

/**
 * Sends the user's message `last` on the conversation the branch rule chooses
 * for it (`before` are the ids of the messages the client sent before it),
 * and gives `send` the answer as AG-UI events until its run ends: none for a
 * resend, which makes no run; else the run the message starts, which
 * waits for a run that goes on the conversation already. The run does not
 * depend on `send`: it goes on, and its ids are recorded, when no one reads
 * it. What it gives is the message of a model call that failed, if one did.
 * Its tools are the ops of `catalog`, each called through the door as `user`.
 * Its trace names `user`, the thread and `agent`, the agent config it runs.
 */
export async function run(
  thread: string,
  model: Model,
  { catalog, user, agent }: { catalog: Catalog; user: string; agent: string },
  {
    runId,
    before,
    last,
  }: {
    runId: string;
    before: readonly string[];
    last: { id: string; content: string };
  },
  send: (event: AGUIEvent) => Promise<void>,
): Promise<{ error?: string }> {
  const que = { ...extension(catalog, call, user), hooks: tracing.hooks };
  registry.install(que);
  const { conversation, resend } = await conversationFor(thread, model, que, {
    runId,
    before,
    last: last.id,
  });
  if (resend) return {};
  const events = await watchEvents(harness, conversation.id, context);
  try {
    const agui = aguiRun();
    // The listener starts before the submission, so it sees the run start; it reads the submission's id once it has one.
    let given!: (id: SubmissionId) => void;
    const own = new Promise<SubmissionId>((resolve) => (given = resolve));
    let mine = false;
    const ended = new Promise<void>((end) =>
      events.start(async (batch) => {
        const id = await own;
        for (const event of batch) {
          if (event.type === "run_start") mine = event.inputs.includes(id);
          if (!mine) continue;
          for (const out of agui.of(event)) await send(out);
          const kept = agui.kept();
          if (
            event.type === "message_end" &&
            AssistantEntry.is(event.entry) &&
            kept
          )
            await conversation.submit(
              { type: "write", entry: idEntry(event.entry.id, kept) },
              context,
            );
          if (event.type === "run_end") {
            mine = false;
            end();
          }
        }
      }),
    );
    // A resend whose message is not placed yet is not in the conversation, so the rule cannot see it: pi's own idempotency gives the submission it has.
    const submission = await tracing.ofRun({ user, thread, agent }, () =>
      conversation.submit(
        {
          type: "input",
          requestId: runId,
          content: last.content,
          entry: userEntry(last.id, runId),
        },
        context,
      ),
    );
    given(submission.id);
    const closed = await Promise.race([ended, events.closed]);
    return closed
      ? { error: `the run's watch ended before the run did: ${closed.reason}` }
      : { error: agui.error() };
  } finally {
    await events.stop();
  }
}

/** Whether the thread's run goes: a task of its conversation, not a background one, is live. */
export async function running(thread: string) {
  const conversation = await conversationOf(thread);
  if (!conversation) return false;
  const { tasks } = await harness.inspect(context);
  return tasks.some(
    ({ record }) =>
      record.conversationId === conversation.id && !record.background,
  );
}

/**
 * Stops the thread's run, if one goes: pi aborts its conversation's work, and
 * gives back once the conversation is idle. A tool's call ends as aborted.
 */
export async function stop(thread: string) {
  await (await conversationOf(thread))?.abort(context);
}

/** The thread's messages, as AG-UI messages: none before its first run. */
export async function messages(thread: string) {
  const conversation = await conversationOf(thread);
  return conversation
    ? heldOf((await conversation.context(context)).entries).map(
        (held) => held.message,
      )
    : [];
}
