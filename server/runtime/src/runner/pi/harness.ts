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
  return made;
}

/**
 * Sends the user's message on the thread's conversation, and gives `send` the
 * answer as AG-UI events until the run ends. The run does not depend on
 * `send`: it goes on, and its ids are recorded, when no one reads it.
 */
export async function run(
  thread: string,
  model: Model,
  message: { id: string; content: string },
  send: (event: AGUIEvent) => Promise<void>,
) {
  const conversation = await conversationOf(thread, model);
  const events = await watchEvents(harness, conversation.id, context);
  const agui = aguiRun();
  const ended = new Promise<void>((end) =>
    events.start(async (batch) => {
      for (const event of batch) {
        for (const out of agui.of(event)) await send(out);
        if (event.type === "message_end" && AssistantEntry.is(event.entry))
          await conversation.submit(
            { type: "write", entry: idEntry(event.entry.id, agui.id()) },
            context,
          );
        if (event.type === "run_end") end();
      }
    }),
  );
  await conversation.submit(
    {
      type: "input",
      content: message.content,
      entry: userEntry(message.id),
    },
    context,
  );
  await ended;
  await events.stop();
}

/** The thread's messages, as AG-UI messages: none before its first run. */
export async function messages(thread: string) {
  const conversation = await conversations.get(thread);
  return conversation
    ? messagesOf((await conversation.context(context)).entries)
    : [];
}
