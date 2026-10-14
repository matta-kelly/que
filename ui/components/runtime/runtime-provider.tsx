"use client";

import { useEffect, useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useLangGraphRuntime,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";
import { checkpointFor } from "@/components/runtime/runs/checkpoint";
import { createClient } from "@/components/runtime/langgraph-client";
import { setStopped } from "@/components/chat/run-states/store";
import {
  loadDeployment,
  pickIn,
  rememberPick,
} from "@/components/chat/run-pickers/pick-store";
import { JoinsRuns } from "@/components/runtime/runs/joins-runs";
import { StopsRuns } from "@/components/runtime/runs/stops-runs";
import { createStreamCall } from "@/components/runtime/runs/stream-call";
import { createThreadListAdapter } from "@/components/runtime/thread-list-adapter";
import { withReasoning } from "@/components/runtime/with-reasoning";

// How far back in a thread a checkpoint is looked for. A turn is one state for
// each step of it, so this is ten turns or more.
const HISTORY = 100;

export function RuntimeProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const client = useMemo(() => createClient(), []);
  const stream = useMemo(() => createStreamCall(client), [client]);

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
    // A message sent while a run is going waits, and is sent when that run ends.
    unstable_enableMessageQueue: true,
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
      setStopped(
        externalId,
        (thread.metadata as { stopped?: unknown } | null)?.stopped === true,
      );
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
