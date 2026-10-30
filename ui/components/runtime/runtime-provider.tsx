"use client";

import { useEffect, useMemo } from "react";
import {
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  useAui,
  useRemoteThreadListRuntime,
  type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { fromAgUiMessages, useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import { loadDeployment } from "@/components/chat/run-pickers/pick-store";
import { oneReplyPerTurn } from "@/components/runtime/one-reply-per-turn";
import { ThreadAgent, threads } from "@/components/runtime/que-client";
import { threadListAdapter } from "@/components/runtime/thread-list-adapter";

/**
 * One chat's runtime: its runs go to que's server over AG-UI, and its messages
 * are loaded from its thread there, with the ids que's server gave them. An
 * edit or a regenerate sends those ids back, and que's server goes on from them.
 */
function useChatRuntime() {
  const aui = useAui();
  const agent = useMemo(
    () =>
      new ThreadAgent(
        async () => (await aui.threadListItem().initialize()).remoteId,
      ),
    [aui],
  );
  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        const { remoteId } = aui.threadListItem().getState();
        if (!remoteId) return { messages: [] };
        const { messages } = await threads.get(remoteId);
        return ExportedMessageRepository.fromArray(
          oneReplyPerTurn(fromAgUiMessages(messages)),
        );
      },
      // que's server keeps each message of a run.
      async append() {},
    }),
    [aui],
  );
  return useAgUiRuntime({
    agent,
    adapters: { history },
    // A turn is one reply: its model calls and tool calls, in the order they came.
    joinStrategy: "concat-content",
    // A message sent while a run is going waits, and is sent when that run ends.
    unstable_enableMessageQueue: true,
  });
}

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
