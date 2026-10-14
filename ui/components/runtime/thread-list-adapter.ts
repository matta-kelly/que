import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import type { Client } from "@langchain/langgraph-sdk";
import {
  pickOf,
  rememberPick,
  useRunPicks,
} from "@/components/chat/run-pickers/pick-store";

// Thread list backed by the LangGraph server, so chats, titles, and archive
// state survive reloads. Thread metadata carries `title` and `archived`, and
// the chat's pick of agent and model (elements/run-pickers/pick); the proxy scopes threads
// to the current user.
type ThreadMeta = { title?: string; archived?: boolean };
export const createThreadListAdapter = (
  client: Client,
): RemoteThreadListAdapter => {
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
