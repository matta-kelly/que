"use client";

import { useMemo } from "react";
import { AssistantRuntimeProvider, type RemoteThreadListAdapter } from "@assistant-ui/react";
import {
  unstable_createLangGraphStream,
  useLangGraphRuntime,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";
import { Client } from "@langchain/langgraph-sdk";

const ASSISTANT_ID = process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID!;

// OpenAI-compatible providers (Fireworks/DeepSeek) put reasoning in
// additional_kwargs.reasoning_content; assistant-ui reads additional_kwargs.reasoning.
type Msg = { additional_kwargs?: Record<string, unknown> };
const withReasoning = <T,>(message: T): T => {
  const kw = (message as Msg)?.additional_kwargs;
  const text = kw?.reasoning_content;
  if (typeof text !== "string" || !text || kw?.reasoning) return message;
  return { ...message, additional_kwargs: { ...kw, reasoning: { type: "reasoning", reasoning: text } } };
};
const mapMessages = (data: unknown) => (Array.isArray(data) ? data.map(withReasoning) : data);


// All requests go through the Next.js proxy at /api.
const createClient = () =>
  new Client({
    apiUrl: typeof window !== "undefined" ? new URL("/api", window.location.href).href : "/api",
  });

// Thread list backed by the LangGraph server, so chats, titles, and archive
// state survive reloads. Thread metadata carries `title` and `archived`; the
// proxy scopes threads to the current rep.
type ThreadMeta = { title?: string; archived?: boolean };
const createThreadListAdapter = (client: Client): RemoteThreadListAdapter => {
  const toMeta = (t: { thread_id: string; metadata: unknown; updated_at: string }) => {
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
      const threads = await client.threads.search({ limit: 100, sortBy: "updated_at", sortOrder: "desc" });
      return { threads: threads.map(toMeta) };
    },
    async initialize() {
      const t = await client.threads.create();
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
    const inner = unstable_createLangGraphStream({ client, assistantId: ASSISTANT_ID });
    return async function* (...args: Parameters<typeof inner>) {
      for await (const event of await inner(...args)) {
        yield event.event.startsWith("messages") ? { ...event, data: mapMessages(event.data) } : event;
      }
    } as typeof inner;
  }, [client]);

  const threadListAdapter = useMemo(() => createThreadListAdapter(client), [client]);

  const runtime = useLangGraphRuntime({
    unstable_allowCancellation: true,
    stream,
    unstable_threadListAdapter: threadListAdapter,
    load: async (externalId) => {
      const state = await client.threads.getState<{ messages: LangChainMessage[] }>(externalId);
      return {
        messages: (state.values?.messages ?? []).map(withReasoning),
        interrupts: state.tasks[0]?.interrupts,
      };
    },
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
