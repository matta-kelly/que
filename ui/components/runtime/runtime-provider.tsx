"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  useAui,
  useRemoteThreadListRuntime,
  type ChatModelRunResult,
  type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { fromAgUiMessages, useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import { queAttachments } from "@/components/chat/attachment/attachment-adapter";
import { loadDeployment } from "@/components/chat/run-pickers/pick-store";
import { setStopped } from "@/components/chat/run-states/store";
import { oneReplyPerTurn } from "@/components/runtime/one-reply-per-turn";
import { join, ThreadAgent, threads } from "@/components/runtime/que-client";
import { threadListAdapter } from "@/components/runtime/thread-list-adapter";

/**
 * One chat's runtime: its runs go to que's server over AG-UI, and its messages
 * are loaded from its thread there, with the ids que's server gave them. An
 * edit or a regenerate sends those ids back, and que's server goes on from them.
 * A chat opened while its reply goes joins the run on que's server: it is
 * loaded to the user's message, and the reply comes from the join, so far and
 * then live, as one reply. When the join ends, the chat is loaded again, so
 * the reply has the id que's server gave it, as each other message has.
 */
function useChatRuntime() {
  const aui = useAui();
  const agent = useMemo(
    () =>
      new ThreadAgent(async () => {
        const { remoteId } = await aui.threadListItem().initialize();
        // A run that starts ends the stop, as it does on que's server.
        setStopped(remoteId, false);
        return remoteId;
      }),
    [aui],
  );
  // Whether the run that goes is a join: its reply has an id of the page's until the chat is loaded again.
  const joining = useRef(false);
  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        const { remoteId } = aui.threadListItem().getState();
        if (!remoteId) return { messages: [] };
        const { messages, stopped, running } = await threads.get(remoteId);
        setStopped(remoteId, stopped);
        // A run that goes is joined: its reply comes from resume().
        const shown = running
          ? messages.slice(0, askedIn(messages) + 1)
          : messages;
        return {
          ...ExportedMessageRepository.fromArray(
            oneReplyPerTurn(fromAgUiMessages(shown)),
          ),
          unstable_resume: running,
        };
      },
      async *resume({ abortSignal }) {
        const { remoteId } = aui.threadListItem().getState();
        if (!remoteId) return;
        joining.current = true;
        for await (const messages of join(remoteId, abortSignal)) {
          const [reply] = oneReplyPerTurn(
            fromAgUiMessages(messages.slice(askedIn(messages) + 1)),
          );
          yield {
            content: (reply?.content ?? []) as ChatModelRunResult["content"],
          };
        }
      },
      // que's server keeps each message of a run.
      async append() {},
    }),
    [aui],
  );
  // The composer's files go to the same thread the agent runs, so a new chat's
  // file waits for the thread its send makes.
  const attachments = useMemo(
    () =>
      queAttachments({
        remoteId: () => aui.threadListItem().getState().remoteId,
        initialize: () => aui.threadListItem().initialize(),
      }),
    [aui],
  );
  const runtime = useAgUiRuntime({
    agent,
    adapters: { history, attachments },
    // A turn is one reply: its model calls and tool calls, in the order they came.
    joinStrategy: "concat-content",
    // A message sent while a run is going waits, and is sent when that run ends.
    unstable_enableMessageQueue: true,
  });
  useEffect(
    () =>
      runtime.thread.unstable_on("runEnd", () => {
        if (!joining.current) return;
        joining.current = false;
        void history.load().then((loaded) => {
          // A run that still goes on que's server (one left in the page only) keeps the reply the page has.
          if (!loaded.unstable_resume) runtime.thread.import(loaded);
        });
      }),
    [runtime, history],
  );
  return runtime;
}

/** Where the user's last message is in the thread's messages: a run's reply is after it. */
const askedIn = (messages: readonly { role: string }[]) =>
  messages.findLastIndex((m) => m.role === "user");

export function RuntimeProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    // Without the list there are no pickers, and a chat runs on the deployment's own choices.
    loadDeployment().catch(() => {});
  }, []);

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useChatRuntime,
    adapter: threadListAdapter,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
