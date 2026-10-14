import { useAuiState } from "@assistant-ui/react";

// The open chat's id on the server. None before its first message.
export const useOpenThread = () =>
  useAuiState(
    (s) =>
      s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)
        ?.remoteId,
  );
