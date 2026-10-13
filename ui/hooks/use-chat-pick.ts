"use client";

import { useAuiState } from "@assistant-ui/react";
import { resolve } from "@/lib/run-pick";
import { pickOf, useRunPicks } from "@/lib/run-pick-store";

/** What the open chat runs on: the deployment, the chat's pick, and what the pick comes to. */
export function useChatPick() {
  const deployment = useRunPicks((s) => s.deployment);
  // The open chat: its id on the server, and before its first message its local id.
  const localId = useAuiState((s) => s.threads.mainThreadId);
  const remoteId = useAuiState(
    (s) =>
      s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)
        ?.remoteId,
  );
  const thread = remoteId ?? localId;
  const pick = useRunPicks((s) => pickOf(s, thread));
  return { deployment, thread, remoteId, shown: resolve(pick, deployment) };
}
