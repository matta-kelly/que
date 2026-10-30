import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { threads, type QueThread } from "@/components/runtime/que-client";
import {
  pickOf,
  rememberPick,
  useRunPicks,
} from "@/components/chat/run-pickers/pick-store";

// The thread list, on que's server: a chat is a thread of the signed-in user's,
// made when its first message is sent, with the picks made before it. Its
// title, archive and picks are kept on its record there, and each thread read
// from the server gives the pickers its picks.
const toMeta = (t: QueThread) => {
  rememberPick(t.id, { agent: t.agent, model: t.model });
  return {
    status: t.archived ? ("archived" as const) : ("regular" as const),
    remoteId: t.id,
    externalId: t.id,
    title: t.title ?? undefined,
    lastMessageAt: new Date(t.createdAt),
  };
};

/** The stream a title comes in. */
type TitleStream = Awaited<
  ReturnType<RemoteThreadListAdapter["generateTitle"]>
>;

export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    // The newest first.
    return { threads: (await threads.list()).reverse().map(toMeta) };
  },
  async initialize(localId) {
    const { remoteId } = toMeta(
      await threads.make(pickOf(useRunPicks.getState(), localId)),
    );
    return { remoteId, externalId: remoteId };
  },
  async fetch(threadId) {
    return toMeta(await threads.get(threadId));
  },
  async rename(remoteId, title) {
    await threads.change(remoteId, { title });
  },
  async archive(remoteId) {
    await threads.change(remoteId, { archived: true });
  },
  async unarchive(remoteId) {
    await threads.change(remoteId, { archived: false });
  },
  delete: threads.remove,
  // No auto-titles yet: chats keep their default title.
  async generateTitle() {
    const none: TitleStream = new ReadableStream({ start: (c) => c.close() });
    return none;
  },
};
