"use client";

import { useEffect, useMemo } from "react";
import {
  AssistantRuntimeProvider,
  type RemoteThreadListAdapter,
} from "@assistant-ui/react";
import {
  unstable_createLangGraphStream,
  useLangGraphRuntime,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";
import type { Client } from "@langchain/langgraph-sdk";
import { createClient } from "@/lib/langgraph-client";
import { resolve } from "@/lib/run-pick";
import {
  loadDeployment,
  pickIn,
  pickOf,
  rememberPick,
  useRunPicks,
} from "@/lib/run-pick-store";

const ASSISTANT_ID = process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID!;

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
// the chat's pick of agent and model (lib/run-pick); the proxy scopes threads
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
    const inner = unstable_createLangGraphStream({
      client,
      assistantId: ASSISTANT_ID,
    });
    // Each run names what its chat picked. The runtime hands in a config of
    // its own (empty for a message; for a resume after an interrupt, the one
    // of the run it resumes), and what that one names is kept.
    return async function* (...[messages, config]: Parameters<typeof inner>) {
      const { externalId } = await config.initialize();
      const state = useRunPicks.getState();
      const { send } = resolve(pickOf(state, externalId), state.deployment);
      const given = (config.runConfig ?? {}) as {
        configurable?: Record<string, unknown>;
      };
      const runConfig = {
        ...given,
        configurable: { ...send, ...given.configurable },
      };
      for await (const event of await inner(messages, {
        ...config,
        runConfig,
      })) {
        yield event.event.startsWith("messages")
          ? { ...event, data: mapMessages(event.data) }
          : event;
      }
    } as typeof inner;
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
      {children}
    </AssistantRuntimeProvider>
  );
}
