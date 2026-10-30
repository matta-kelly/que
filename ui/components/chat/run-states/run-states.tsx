"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import type { FC } from "react";
import { StoppedRun } from "./stopped-run";
import { useStop } from "./stop";
import { useRunStates } from "./store";

/**
 * Above the composer, what the open chat's run is in when it did not go the
 * plain way: a mark when its reply was stopped, with a way to go on. The
 * user's Stop is heard here.
 */
export const RunStates: FC = () => {
  useStop();
  // The open chat's id on the server. None before its first message.
  const thread = useAuiState(
    (s) =>
      s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)
        ?.remoteId,
  );
  const running = useAuiState((s) => s.thread.isRunning);
  const stopped = useRunStates((s) => !!thread && !!s.stopped[thread]);
  // The last message of the user's: a stopped reply is run again from it.
  const asked = useAuiState(
    (s) => s.thread.messages.findLast((m) => m.role === "user")?.id,
  );
  const aui = useAui();
  if (!thread || !stopped || running) return null;
  return (
    <div className="px-1 pb-2">
      <StoppedRun
        reason="Stopped"
        // que's server keeps the reply as far as it came; Continue answers again, beside it.
        note="The reply so far is kept. Continue writes a new one."
        onContinue={() => {
          if (asked) aui.thread().startRun({ parentId: asked });
        }}
      />
    </div>
  );
};
