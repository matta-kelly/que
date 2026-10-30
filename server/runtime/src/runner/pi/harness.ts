/**
 * The engine's Harness: one for the server, on pi's memory storage, so a
 * restart loses it, and the link from each thread to its conversation is a
 * process Map. Each run goes on the conversation the branch rule (branch.ts)
 * chooses: the thread's, a fork of it, or a new one, which the thread then
 * points at. A new conversation gets its agent then: a change to what the
 * agent is built from takes effect from the next chat, and a fork keeps its
 * parent's. The user's catalog is read
 * at each run: each user has an extension of their own, installed again
 * with their catalog before each of their runs, and the thread's
 * conversation selects it.
 *
 * `models` is the pi-ai models collection the Harness reads at each use, with
 * Fireworks and the deployment's models on it from when this module loads.
 */

import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  AssistantEntry,
  createRegistry,
  Harness,
  MemoryStorage,
  watchEvents,
  type Conversation,
  type Extension,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import type { AGUIEvent } from "@ag-ui/core";
import { fireworks } from "@que/chat-model";
import { providerModelOf, providerOf, type Model } from "@mku1tra/que-harness";
import type { Catalog } from "../../access/catalog.js";
import { access } from "../../access/connections.js";
import { door } from "../../assemble/door.js";
import * as mounted from "../../mount/mounted.js";
import { aguiRun, heldOf, idEntry, userEntry } from "./agui.js";
import { branchOf } from "./branch.js";
import { extension } from "./extension.js";

export const models = createModels();
models.setProvider(fireworks(mounted.models));

// Every op runs through the door, on the runtime's access.
const call = door(access.getConnection);

const registry = createRegistry();
const harness = await Harness.open(
  new MemoryStorage(),
  { models, registry },
  context,
);

/** Each thread's conversation: the one its last run chose, none before its first. */
const conversations = new Map<string, Promise<Conversation | undefined>>();

const ownership = { kind: "ownerless" } as const;

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
  const had = conversations.get(thread);
  const chosen = (async () => {
    const current = await had;
    const held = current
      ? heldOf((await current.context(context)).entries)
      : [];
    const branch = branchOf(held, input);
    if (current && (branch.kind === "same" || branch.kind === "resend"))
      return { conversation: current, resend: branch.kind === "resend" };
    const conversation =
      current && branch.kind === "fork"
        ? await current.fork(branch.at, { ownership }, context)
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
    return { conversation, resend: false };
  })();
  conversations.set(
    thread,
    chosen.then(
      ({ conversation }) => conversation,
      () => had,
    ),
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
 */
export async function run(
  thread: string,
  model: Model,
  { catalog, user }: { catalog: Catalog; user: string },
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
  const que = extension(catalog, call, user);
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
    const submission = await conversation.submit(
      {
        type: "input",
        content: last.content,
        entry: userEntry(last.id, runId),
      },
      context,
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

/** The thread's messages, as AG-UI messages: none before its first run. */
export async function messages(thread: string) {
  const conversation = await conversations.get(thread);
  return conversation
    ? heldOf((await conversation.context(context)).entries).map(
        (held) => held.message,
      )
    : [];
}
