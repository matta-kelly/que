"use client";

import { useAuiState } from "@assistant-ui/react";
import { useLangGraphSend } from "@assistant-ui/react-langgraph";
import type { FC } from "react";
import { runs } from "@/components/runtime/runs/run-of-thread";
import { ConnectionState } from "./connection-state";
import { StoppedRun } from "./stopped-run";
import { useRunStates } from "./store";

/**
 * Above the composer, what the open chat's run is in when it did not go the
 * plain way: a line while the chat picks its run up again, and a mark when its
 * reply was stopped, with a way to go on.
 */
export const RunStates: FC = () => {
  // The open chat's id on the server. None before its first message.
  const thread = useAuiState(
    (s) =>
      s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)
        ?.remoteId,
  );
  const running = useAuiState((s) => s.thread.isRunning);
  const stopped = useRunStates((s) => !!thread && !!s.stopped[thread]);
  const reconnecting = useRunStates(
    (s) => !!thread && !!s.reconnecting[thread],
  );
  const send = useLangGraphSend();
  if (!thread) return null;

  if (reconnecting)
    return (
      <div className="flex justify-center pb-2">
        <ConnectionState phase="reconnecting" />
      </div>
    );
  if (!stopped || running) return null;
  return (
    <div className="px-1 pb-2">
      <StoppedRun
        reason="Stopped"
        // The part of the reply that came in is not in the saved chat: a run saves a step when it ends.
        note="The reply in progress was not saved. Continue writes it again."
        onContinue={() => {
          // With no run kept, a send of no message is a new run from the last saved step, and not a join.
          runs.clear(thread);
          void send([], {});
        }}
      />
    </div>
  );
};
