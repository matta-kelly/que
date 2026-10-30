import { useAui, useAuiEvent } from "@assistant-ui/react";
import { threads } from "@/components/runtime/que-client";
import { setStopped } from "./store";

/**
 * The user's Stop: each cancel of the thread composer (its Stop button, and
 * Escape in its input) stops the thread's run on que's server, and the chat
 * says so as que's server does: a run that had ended is not stopped. A chat
 * that is left is not stopped: its runtime's teardown cancels the run in the
 * page only, and sends no `composer.cancel`.
 */
export function useStop() {
  const aui = useAui();
  useAuiEvent("composer.cancel", () => {
    const { remoteId } = aui.threadListItem().getState();
    if (!remoteId) return;
    void threads
      .stop(remoteId)
      .then(({ stopped }) => setStopped(remoteId, stopped));
  });
}
