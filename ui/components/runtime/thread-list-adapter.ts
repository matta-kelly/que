import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { threads, type QueThread } from "@/components/runtime/que-client";

// The thread list, on que's server: a chat is a thread of the signed-in user's,
// made when its first message is sent. que's server has no title for a thread,
// and no route to rename, archive or delete one.
const toMeta = (t: QueThread) => ({
  status: "regular" as const,
  remoteId: t.id,
  externalId: t.id,
  lastMessageAt: new Date(t.createdAt),
});

const unsupported = async () => {
  throw new Error("que's server cannot change a thread");
};

export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    // The newest first.
    return { threads: (await threads.list()).reverse().map(toMeta) };
  },
  async initialize() {
    const { id } = await threads.make();
    return { remoteId: id, externalId: id };
  },
  async fetch(threadId) {
    return toMeta(await threads.get(threadId));
  },
  rename: unsupported,
  archive: unsupported,
  unarchive: unsupported,
  delete: unsupported,
  // No auto-titles yet: chats keep their default title.
  async generateTitle() {
    return new ReadableStream({ start: (c) => c.close() }) as never;
  },
};
