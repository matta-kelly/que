/**
 * The engine's Harness: one for the server, on pi's storage in Postgres, on one
 * dedicated connection (a commit's BEGIN and COMMIT must run on one
 * connection, which a pool cannot promise), and the link from each thread to
 * its conversation is its row. The connection takes a session advisory lock
 * when this module loads, so one process owns a deployment. Each run goes on
 * the conversation the branch rule (branch.ts) chooses: the thread's, or one
 * it has left (its row keeps each), a fork of it, or a new one, which the
 * thread then points at. A new conversation gets its agent then: a change to
 * what the agent is built from takes effect from the next chat, and a fork
 * keeps its parent's. The model is the run's own: a conversation on another
 * model is moved to it, and to its effort. The user's catalog is read at each
 * run: each conversation has an extension of its own, `que.<id>`, installed
 * again with its user's catalog before each of its runs and removed after it,
 * and it selects that one alone, so two runs at once never share tools.
 * Each conversation has a cwd of its own, the folder its run's files are in,
 * and a fork keeps its parent's.
 *
 * `models` is the pi-ai models collection the Harness reads at each use, with
 * Fireworks and the deployment's models on it from when this module loads.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  AssistantEntry,
  createRegistry,
  Harness,
  LiveDoc,
  section,
  ToolResultEntry,
  watchEvents,
  type CompactionPolicy,
  type Conversation,
  type ConversationId,
  type EntryRecord,
  type Extension,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import type { AGUIEvent } from "@ag-ui/core";
import { fireworks, levelOf } from "@que/chat-model";
import { storageOn } from "@que/pi-storage";
import { createStore } from "@que/threads";
import {
  providerModelOf,
  providerOf,
  type Model,
  type ResolvedLoop,
} from "@mku1tra/que-harness";
import type { Catalog } from "../../access/catalog.js";
import { access } from "../../access/connections.js";
import { door } from "../../assemble/door.js";
import { systemPrompt } from "../../assemble/prompt.js";
import type { Way } from "../../assemble/way.js";
import * as mounted from "../../mount/mounted.js";
import { loopFor } from "../../run/loop.js";
import { settingsFor, tracingOnPi } from "../../run/trace.js";
import { aguiRun, heldOf, idEntry, userEntry } from "./agui.js";
import { branchedFrom, branchOf } from "./branch.js";
import { compactionOf } from "./compaction.js";
import { endsRun, extension } from "./extension.js";

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
// The deployment's data: QUE_DATA_DIR, where a server mounts a volume, or the user's data folder (XDG). Not the
// deployment's folder, which is a checkout of code: in the vault on this machine, replaced at each deploy on a server.
const data =
  process.env.QUE_DATA_DIR ||
  join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "que",
    mounted.name,
  );

/** A conversation's own cwd, by its id. */
const cwdOf = (id: ConversationId) => join(data, "conversations", String(id));

/** A model's key in pi's settings: `provider/modelId`. */
const keyOf = (model: Model) =>
  `${providerOf(model)}/${providerModelOf(model)}`;

/**
 * Each model's compaction, by its key: pi's settings are per model id, not
 * per conversation. Each agent's own model has its loop's from startup, so a
 * run pi resumes after a restart has it too (mount refuses two agents on one
 * model id that would get different ones), and a run sets its model's from its
 * loop, for a model a thread picks.
 */
const compactions: Record<string, Partial<CompactionPolicy>> = {};
for (const agent of mounted.agents) {
  const model = mounted.models.find((m) => m.name === agent.model)!;
  compactions[keyOf(model)] = compactionOf(
    model.window,
    loopFor(mounted.loops, agent).summarize,
  );
}

const harness = await Harness.open(
  storageOn(client),
  {
    models,
    registry,
    settings: () => ({ compaction: { modelOverrides: compactions } }),
    telemetry: tracing.telemetry,
    // A run's files are in its conversation's cwd. A conversation made before it had one gets its own.
    env: ({ conversationId, cwd }) =>
      new NodeExecutionEnv({ cwd: cwd ?? cwdOf(conversationId) }),
  },
  context,
);

/** The thread records, and each thread's conversation, in its row. */
const threads = createStore();

/** Each thread's turn: its runs choose one at a time, in the order they came. */
const turns = new Map<string, Promise<unknown>>();

const ownership = { kind: "ownerless" } as const;

/**
 * The conversation of this id the row holds, or none: the row's text is the
 * only guard on the id, so a value that is not a decimal reads as none.
 */
async function conversationAt(kept: string | null) {
  return kept !== null && /^\d+$/.test(kept)
    ? await harness.conversation(Number(kept) as ConversationId, context)
    : undefined;
}

/** The thread's conversation, or none: before its first run, or when its row holds a value that is not one. */
async function conversationOf(thread: string) {
  return conversationAt(await threads.conversationOf(thread));
}

/** What a conversation on `model` runs with: the model, and the thinking level that sends its effort. */
const agentOn = (model: Model) => ({
  model: { provider: providerOf(model), modelId: providerModelOf(model) },
  thinkingLevel: levelOf(model) ?? ("off" as const),
});

/**
 * The conversation, on `model`: a thread whose model pick changed since its
 * conversation was made changes its conversation's model and thinking level.
 */
async function onModel(conversation: Conversation, model: Model) {
  const on = agentOn(model);
  const had = await conversation.agent(context);
  if (
    had.model?.provider !== on.model.provider ||
    had.model.modelId !== on.model.modelId ||
    had.thinkingLevel !== on.thinkingLevel
  )
    await conversation.configure(on, context);
  return conversation;
}

/**
 * The new conversation, on a cwd of its own, which the env roots its files at. A fork keeps its parent's, so the
 * pointers it keeps from the parent's chat still name their files.
 */
async function ownCwd(conversation: Conversation) {
  await conversation.configure({ cwd: cwdOf(conversation.id) }, context);
  return conversation;
}

/**
 * Installs the conversation's own extension, `que.<id>`, from `que`, and has
 * the conversation select it alone, so its tools and prompt are its own and
 * no other conversation's run changes them. A new conversation, a fork (which
 * starts with its parent's) and one on an older name are set to it once.
 */
async function ownExtension(
  conversation: Conversation,
  que: Omit<Extension, "name">,
) {
  const own = { ...que, name: `que.${conversation.id}` };
  registry.install(own);
  const { extensions } = await conversation.agent(context);
  if (extensions.length !== 1 || extensions[0]?.name !== own.name)
    await conversation.configure({ extensions: [own] }, context);
  return own;
}

/**
 * Removes the conversation's extension `own` once its run has ended, so the
 * registry holds one only for a conversation with work: not while a task of
 * the conversation is live (a background compaction, say), and not once a
 * later run has installed its own. A kept one goes at the end of the next run.
 */
async function release(conversation: Conversation, own: Extension) {
  const { tasks } = await harness.inspect(context);
  if (tasks.some(({ record }) => record.conversationId === conversation.id))
    return;
  if (registry.snapshot().extension(own.name) === own) registry.uninstall(own);
}

/**
 * The conversation a run goes on, chosen by the branch rule, and made the
 * thread's, on its own extension from `que`; with `resend`, the run is one
 * that is made already. A thread's runs choose one at a time, in the order
 * they came. A conversation that could not be made is not kept: the thread
 * stays on the one it had.
 */
function conversationFor(
  thread: string,
  model: Model,
  que: Omit<Extension, "name">,
  input: { runId: string; before: readonly string[]; last: string },
) {
  const had = turns.get(thread) ?? Promise.resolve();
  const chosen = (async () => {
    await had.catch(() => {});
    // The thread's own conversation first, then the branches it has left.
    const branches = (
      await Promise.all(
        (await threads.conversationsOf(thread)).map(conversationAt),
      )
    ).filter((c) => c !== undefined);
    const helds = await Promise.all(
      branches.map(async (c) => heldOf((await c.context(context)).entries)),
    );
    const at = branchedFrom(helds, input);
    const from = branches[at];
    const branch = branchOf(helds[at] ?? [], input);
    if (from && branch.kind === "resend")
      return { conversation: from, resend: true } as const;
    const conversation =
      from && branch.kind !== "new"
        ? await onModel(
            branch.kind === "fork"
              ? await from.fork(branch.at, { ownership }, context)
              : from,
            model,
          )
        : await ownCwd(
            await harness.createConversation(
              {
                ownership,
                agent: agentOn(model),
              },
              context,
            ),
          );
    const own = await ownExtension(conversation, que);
    if (conversation.id !== branches[0]?.id)
      await threads.setConversation(thread, String(conversation.id));
    return { conversation, resend: false, own } as const;
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
 * Its system prompt is the agent's, as assemble's `systemPrompt` gives it from
 * `prompt`, `catalog` and `way`, the agent's way of loading, sent as it is; the
 * way also says when an op is offered (extension.ts). A result over the loop's
 * `result` setting is moved to a file in the conversation's cwd (result.ts).
 * The loop's `summarize` setting is set as its model's compaction. Its trace
 * names `user`, the thread and `agent`, the agent config it runs, and holds
 * `tags`.
 */
export async function run(
  thread: string,
  model: Model,
  {
    catalog,
    user,
    agent,
    tags,
    prompt,
    way,
    result,
    summarize,
  }: {
    catalog: Catalog;
    user: string;
    agent: string;
    tags?: string[];
    prompt: Omit<Parameters<typeof systemPrompt>[0], "catalog" | "environment">;
    way: Way;
    result?: ResolvedLoop["result"];
    summarize: ResolvedLoop["summarize"];
  },
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
  const text = systemPrompt({ ...prompt, catalog, environment: way.prompt });
  const que = {
    ...extension(catalog, call, user, way, result),
    // One section, untagged: the model reads que's prompt whole, as systemPrompt writes it.
    sections: [section("prompt", () => text, { tag: false })],
    hooks: tracing.hooks,
  };
  const chosen = await conversationFor(thread, model, que, {
    runId,
    before,
    last: last.id,
  });
  if (chosen.resend) return {};
  const { conversation, own } = chosen;
  compactions[keyOf(model)] = compactionOf(model.window, summarize);
  const events = await watchEvents(harness, conversation.id, context);
  try {
    const agui = aguiRun();
    // The listener starts before the submission, so it sees the run start; it reads the submission's id once it has one.
    let given!: (id: SubmissionId) => void;
    const own = new Promise<SubmissionId>((resolve) => (given = resolve));
    let mine = false;
    /** The tool round of the run's last response: its calls, its results so far, and those the run ends on. */
    let round = { calls: 0, results: 0, ends: 0 };
    const ended = new Promise<void>((end) =>
      events.start(async (batch) => {
        const id = await own;
        for (const event of batch) {
          if (event.type === "run_start") mine = event.inputs.includes(id);
          if (!mine) continue;
          for (const out of agui.of(event)) await send(out);
          if (event.type === "message_end" && AssistantEntry.is(event.entry))
            round = { calls: callsOf(event.entry), results: 0, ends: 0 };
          if (event.type === "tool_execution_end" && event.entry) {
            round.results++;
            const result = ToolResultEntry.is(event.entry)
              ? event.entry.model?.[0]
              : undefined;
            if (result?.role === "toolResult" && endsRun(result.details))
              round.ends++;
            // pi ended the run itself when every result asked; one that did not keeps it going, so it is ended here.
            if (
              round.results === round.calls &&
              round.ends > 0 &&
              round.ends < round.calls
            )
              void endRun(conversation, id);
          }
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
    const submission = await tracing.ofRun({ user, thread, agent, tags }, () =>
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
    // The run has its answer: a fault in removing its extension is logged, not the run's.
    await release(conversation, own).catch((error: Error) =>
      console.error(
        "que: the conversation's extension was not removed:",
        error.message,
      ),
    );
  }
}

/** The tool calls of a model response. */
const callsOf = (entry: EntryRecord) =>
  (entry.model?.[0]?.role === "assistant" ? entry.model[0].content : []).filter(
    (block) => block.type === "toolCall",
  ).length;

/**
 * Ends the run of input `id`, if it still goes: its generation alone is
 * aborted, so an input queued behind it is not withdrawn (pi's
 * `Conversation.abort` withdraws it).
 */
async function endRun(conversation: Conversation, id: SubmissionId) {
  try {
    const run = (await harness.snapshot(LiveDoc, conversation.id, context))
      ?.run;
    if (run?.inputs.includes(id)) await harness.abortTask(run.taskId, context);
  } catch (error) {
    console.error("que: the run was not stopped:", (error as Error).message);
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
