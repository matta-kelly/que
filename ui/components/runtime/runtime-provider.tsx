"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AssistantRuntimeProvider,
  useAuiEvent,
  useAuiState,
  type RemoteThreadListAdapter,
} from "@assistant-ui/react";
import {
  useLangGraphRuntime,
  useLangGraphSend,
  type LangChainMessage,
  type LangGraphMessagesEvent,
  type LangGraphStreamCallback,
} from "@assistant-ui/react-langgraph";
import type { Client } from "@langchain/langgraph-sdk";
import { checkpointFor } from "@/components/runtime/checkpoint";
import { createClient } from "@/components/runtime/langgraph-client";
import { runs } from "@/components/runtime/run-of-thread";
import { resolve } from "@/components/assistant-ui/elements/run-pickers/pick";
import {
  loadDeployment,
  pickIn,
  pickOf,
  rememberPick,
  useRunPicks,
} from "@/components/assistant-ui/elements/run-pickers/pick-store";

const ASSISTANT_ID = process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID!;
// A stop was asked for while the chat did not have the id of its run yet.
let stopAsked = false;
// As the library's own stream call asks for.
const STREAM_MODE: ("messages" | "updates" | "custom")[] = [
  "messages",
  "updates",
  "custom",
];

// How far back in a thread a checkpoint is looked for. A turn is one state for
// each step of it, so this is ten turns or more.
const HISTORY = 100;

// OpenAI-compatible providers (Fireworks/DeepSeek) put reasoning in
// additional_kwargs.reasoning_content; assistant-ui reads additional_kwargs.reasoning.
type Msg = { additional_kwargs?: Record<string, unknown> };
const withReasoning = <T,>(message: T): T => {
  const kw = (message as Msg)?.additional_kwargs;
  const text = kw?.reasoning_content;
  if (typeof text !== "string" || !text || kw?.reasoning) return message;
  return {
    ...message,
    additional_kwargs: {
      ...kw,
      reasoning: { type: "reasoning", reasoning: text },
    },
  };
};
const mapMessages = (data: unknown) =>
  Array.isArray(data) ? data.map(withReasoning) : data;

// Thread list backed by the LangGraph server, so chats, titles, and archive
// state survive reloads. Thread metadata carries `title` and `archived`, and
// the chat's pick of agent and model (elements/run-pickers/pick); the proxy scopes threads
// to the current user.
type ThreadMeta = { title?: string; archived?: boolean };
const createThreadListAdapter = (client: Client): RemoteThreadListAdapter => {
  const toMeta = (t: {
    thread_id: string;
    metadata: unknown;
    updated_at: string;
  }) => {
    const meta = (t.metadata ?? {}) as ThreadMeta;
    return {
      status: meta.archived ? ("archived" as const) : ("regular" as const),
      remoteId: t.thread_id,
      externalId: t.thread_id,
      title: meta.title,
      lastMessageAt: new Date(t.updated_at),
    };
  };
  return {
    async list() {
      const threads = await client.threads.search({
        limit: 100,
        sortBy: "updated_at",
        sortOrder: "desc",
      });
      return { threads: threads.map(toMeta) };
    },
    // A pick made before the first message is under the thread's local id.
    async initialize(localId) {
      const pick = pickOf(useRunPicks.getState(), localId);
      const t = await client.threads.create({ metadata: pick });
      rememberPick(t.thread_id, pick);
      return { remoteId: t.thread_id, externalId: t.thread_id };
    },
    async fetch(threadId) {
      return toMeta(await client.threads.get(threadId));
    },
    async rename(remoteId, title) {
      await client.threads.update(remoteId, { metadata: { title } });
    },
    async archive(remoteId) {
      await client.threads.update(remoteId, { metadata: { archived: true } });
    },
    async unarchive(remoteId) {
      await client.threads.update(remoteId, { metadata: { archived: false } });
    },
    async delete(remoteId) {
      await client.threads.delete(remoteId);
    },
    // No auto-titles yet: chats keep their default title until renamed.
    async generateTitle() {
      return new ReadableStream({ start: (c) => c.close() }) as never;
    },
  };
};

export function RuntimeProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const client = useMemo(() => createClient(), []);
  const stream = useMemo(() => {
    // que makes the stream call itself: the library's helper cannot send a run that
    // outlives its connection. A run is sent to go on when its stream ends
    // (`onDisconnect`), with its events kept (`streamResumable`), so a cut stream
    // is picked up again, by the SDK from the last event it got, and by the chat
    // when it is opened again. Stop is then a call of its own: see `StopsRuns`.
    const call: LangGraphStreamCallback<LangChainMessage> = async function* (
      messages,
      config,
    ) {
      const { externalId: thread } = await config.initialize();
      if (!thread) throw new Error("Thread has not been initialized.");
      // A send of no message, on a thread that has a run going: the chat was
      // opened in the middle of that run, and joins it. From its first event:
      // each one holds a message whole so far, so one the chat has is not doubled.
      const going = runs.get(thread);
      // Not a refresh of a reply: that is a send of no message too, from a checkpoint.
      const joins =
        going !== undefined &&
        !messages.length &&
        config.command == null &&
        config.checkpointId == null;
      stopAsked = false;
      let run = joins ? going : undefined;
      try {
        if (joins) {
          yield* client.runs.joinStream(thread, going, {
            signal: config.abortSignal,
            lastEventId: "-1",
            streamMode: STREAM_MODE,
          }) as AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>>;
        } else {
          // Each run names what its chat picked. The runtime hands in a config of
          // its own (empty for a message; for a resume after an interrupt, the one
          // of the run it resumes), and what that one names is kept.
          const state = useRunPicks.getState();
          const { send } = resolve(pickOf(state, thread), state.deployment);
          const given = (config.runConfig ?? {}) as {
            configurable?: Record<string, unknown>;
          };
          yield* client.runs.stream(thread, ASSISTANT_ID, {
            input: messages.length ? { messages } : null,
            streamMode: STREAM_MODE,
            signal: config.abortSignal,
            onDisconnect: "continue",
            streamResumable: true,
            ...(config.command != null && { command: config.command }),
            ...(config.checkpointId != null && {
              // The id alone, as the library's own stream call sends it.
              checkpoint: { checkpoint_id: config.checkpointId } as never,
            }),
            config: {
              ...given,
              configurable: { ...send, ...given.configurable },
            },
            onRunCreated: ({ run_id }) => {
              run = run_id;
              runs.set(thread, run_id);
            },
          }) as AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>>;
        }
        // The stream came to its end, so the run is over. A stream that was cut
        // (a stop, a reload, a look at another chat, a network that dropped)
        // leaves what is kept as it is: the run may be going on, and the chat
        // asks the server when it is opened again.
        if (run) runs.clear(thread, run);
      } catch (error) {
        // A stop that came before the id of the run did: the run is on the server
        // with nothing in the chat to name it, so it is found there and cancelled.
        if (config.abortSignal.aborted && !run && stopAsked) {
          stopAsked = false;
          // Asked for by status: a list of all the runs of a thread is its first few, in no order.
          for (const status of ["pending", "running"] as const) {
            const active = await client.runs
              .list(thread, { status })
              .catch(() => []);
            for (const { run_id } of active)
              client.runs
                .cancel(thread, run_id, false, "interrupt")
                .catch(() => {});
          }
        }
        // An end from this side is not an error for the chat. A join that fails is a
        // run with no events left to give: the chat is as it was loaded.
        if (config.abortSignal.aborted || joins) return;
        throw error;
      }
    };
    return async function* (...args: Parameters<typeof call>) {
      for await (const event of await call(...args)) {
        yield event.event.startsWith("messages")
          ? { ...event, data: mapMessages(event.data) }
          : event;
      }
    } as typeof call;
  }, [client]);

  useEffect(() => {
    // Without the list there are no pickers, and a chat runs on the deployment's own choices.
    loadDeployment().catch(() => {});
  }, []);

  const threadListAdapter = useMemo(
    () => createThreadListAdapter(client),
    [client],
  );

  const runtime = useLangGraphRuntime({
    unstable_allowCancellation: true,
    stream,
    unstable_threadListAdapter: threadListAdapter,
    // With this, a reply can be made again and a sent message edited: the run
    // starts from the checkpoint that held the messages before it.
    getCheckpointId: async (threadId, parents) =>
      checkpointFor(
        await client.threads.getHistory(threadId, { limit: HISTORY }),
        parents,
      ),
    load: async (externalId) => {
      const [state, thread] = await Promise.all([
        client.threads.getState<{ messages: LangChainMessage[] }>(externalId),
        client.threads.get(externalId),
      ]);
      rememberPick(externalId, pickIn(thread.metadata));
      return {
        messages: (state.values?.messages ?? []).map(withReasoning),
        interrupts: state.tasks[0]?.interrupts,
      };
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <StopsRuns client={client} />
      <JoinsRuns client={client} />
      {children}
    </AssistantRuntimeProvider>
  );
}

// The open chat's id on the server. None before its first message.
const useOpenThread = () =>
  useAuiState(
    (s) =>
      s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)
        ?.remoteId,
  );

/**
 * Stop is a call. The library ends its own stream when the user stops a run,
 * and a run now goes on when its stream ends, so the run is cancelled here.
 * `interrupt` keeps what the run saved and leaves the thread to be used;
 * `rollback` leaves it in an error state on this server.
 */
function StopsRuns({ client }: Readonly<{ client: Client }>) {
  const thread = useOpenThread();
  const stop = () => {
    const run = thread && runs.get(thread);
    if (!run) {
      // The run is being made. The stream call cancels it when its fetch ends.
      stopAsked = true;
      return;
    }
    runs.clear(thread, run);
    // A run that has just ended cannot be cancelled, and the chat is as it should be.
    client.runs.cancel(thread, run, false, "interrupt").catch(() => {});
  };
  // The stop button and Escape go by the composer, and a call from code by the thread.
  // From the root: this is outside the thread the events are sent in.
  useAuiEvent({ scope: "*", event: "composer.cancel" }, stop);
  useAuiEvent({ scope: "*", event: "thread.cancelRun" }, stop);
  return null;
}

/**
 * A chat that is opened while its run is going joins it: after a reload. (A
 * look at another chat does not end the stream: the library keeps a thread it
 * has opened, with its stream, so that chat is still on its run on the way back.) When the saved chat is loaded, a run that is
 * still going on the server is started in the library with no message, which
 * the stream call answers with the events of that run.
 */
function JoinsRuns({ client }: Readonly<{ client: Client }>) {
  const thread = useOpenThread();
  const loading = useAuiState((s) => s.thread.isLoading);
  const running = useAuiState((s) => s.thread.isRunning);
  const send = useLangGraphSend();
  // One look for a visit of a chat. A chat that has a run going in this visit
  // (it made the run, or joined it) has had its look: when that run ends, or is
  // stopped, the chat does not go and join it.
  const looked = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!thread) looked.current = undefined;
    if (!thread || looked.current === thread) return;
    if (running) looked.current = thread;
    if (running || loading) return;
    looked.current = thread;
    const run = runs.get(thread);
    if (!run) return;
    let left = false;
    client.runs
      .get(thread, run)
      .then(({ status }) => {
        if (left) return;
        if (status === "pending" || status === "running") return send([], {});
        runs.clear(thread, run);
      })
      // A run the server does not have is no run to join. A server that does not
      // answer says nothing of the run: what is kept stays, for the next visit.
      .catch((error: { status?: number }) => {
        if (error?.status === 404) runs.clear(thread, run);
      });
    return () => {
      left = true;
    };
  }, [client, loading, running, send, thread]);
  return null;
}
