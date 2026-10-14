import { useAuiEvent } from "@assistant-ui/react";
import type { Client } from "@langchain/langgraph-sdk";
import { setStopped } from "@/components/chat/run-states/store";
import { runs } from "@/components/runtime/runs/run-of-thread";
import { askStop } from "@/components/runtime/runs/stream-call";
import { useOpenThread } from "@/components/runtime/runs/use-open-thread";

/**
 * Stop is a call. The library ends its own stream when the user stops a run,
 * and a run now goes on when its stream ends, so the run is cancelled here.
 * `interrupt` keeps what the run saved and leaves the thread to be used;
 * `rollback` leaves it in an error state on this server.
 */
export function StopsRuns({ client }: Readonly<{ client: Client }>) {
  const thread = useOpenThread();
  const stop = () => {
    const run = thread && runs.get(thread);
    if (!run) {
      // The run is being made. The stream call cancels it when its fetch ends.
      askStop();
      return;
    }
    runs.clear(thread, run);
    // The mark of a stop is kept with the thread, so a reload and another tab show it.
    setStopped(thread, true);
    client.threads
      .update(thread, { metadata: { stopped: true } })
      .catch(() => {});
    // A run that has just ended cannot be cancelled, and the chat is as it should be.
    client.runs.cancel(thread, run, false, "interrupt").catch(() => {});
  };
  // The stop button and Escape go by the composer, and a call from code by the thread.
  // From the root: this is outside the thread the events are sent in.
  useAuiEvent({ scope: "*", event: "composer.cancel" }, stop);
  useAuiEvent({ scope: "*", event: "thread.cancelRun" }, stop);
  return null;
}
