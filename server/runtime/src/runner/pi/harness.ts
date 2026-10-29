/**
 * The engine's Harness: one for the server, one conversation for each thread,
 * on pi's memory storage, so a restart loses both. A thread's conversation is
 * made at its first run, with its agent set then: a change to what the agent
 * is built from takes effect from the next chat.
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
  type SubmissionId,
} from "@earendil-works/pi-durable";
import type { AGUIEvent } from "@ag-ui/core";
import { fireworks } from "@que/chat-model";
import { providerModelOf, providerOf, type Model } from "@mku1tra/que-harness";
import * as mounted from "../../mount/mounted.js";
import { aguiRun, idEntry, messagesOf, userEntry } from "./agui.js";

export const models = createModels();
models.setProvider(fireworks(mounted.models));

const harness = await Harness.open(
  new MemoryStorage(),
  { models, registry: createRegistry() },
  context,
);

const conversations = new Map<string, Promise<Conversation>>();

function conversationOf(thread: string, model: Model) {
  const made =
    conversations.get(thread) ??
    harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: {
            provider: providerOf(model),
            modelId: providerModelOf(model),
          },
        },
      },
      context,
    );
  conversations.set(thread, made);
  // A conversation that could not be made is not kept: the thread's next run makes it again.
  made.catch(() => {
    if (conversations.get(thread) === made) conversations.delete(thread);
  });
  return made;
}

/**
 * Sends the user's message on the thread's conversation, and gives `send` the
 * answer as AG-UI events until its run ends: the run the message starts, which
 * waits for a run that goes on the conversation already. The run does not
 * depend on `send`: it goes on, and its ids are recorded, when no one reads
 * it. What it gives is the message of a model call that failed, if one did.
 */
export async function run(
  thread: string,
  model: Model,
  message: { id: string; content: string },
  send: (event: AGUIEvent) => Promise<void>,
): Promise<{ error?: string }> {
  const conversation = await conversationOf(thread, model);
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
        content: message.content,
        entry: userEntry(message.id),
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
    ? messagesOf((await conversation.context(context)).entries)
    : [];
}
