import { useEffect, useRef } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useLangGraphSend } from "@assistant-ui/react-langgraph";
import type { Client } from "@langchain/langgraph-sdk";
import { keptRun } from "@/components/runtime/runs/kept-run";
import { runs } from "@/components/runtime/runs/run-of-thread";
import { useOpenThread } from "@/components/runtime/runs/use-open-thread";

/**
 * A chat that is opened while its run is going joins it: after a reload. (A
 * look at another chat does not end the stream: the library keeps a thread it
 * has opened, with its stream, so that chat is still on its run on the way back.) When the saved chat is loaded, a run that is
 * still going on the server is started in the library with no message, which
 * the stream call answers with the events of that run.
 */
export function JoinsRuns({ client }: Readonly<{ client: Client }>) {
  const thread = useOpenThread();
  const loading = useAuiState((s) => s.thread.isLoading);
  const running = useAuiState((s) => s.thread.isRunning);
  const send = useLangGraphSend();
  // One look for a visit of a chat. A chat that has a run going in this visit
  // (it made the run, or joined it) has had its look: when that run ends, or is
  // stopped, the chat does not go and join it.
  const looked = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!thread) looked.current = undefined;
    if (!thread || looked.current === thread) return;
    if (running) looked.current = thread;
    if (running || loading) return;
    looked.current = thread;
    const run = runs.get(thread);
    if (!run) return;
    let left = false;
    client.runs
      .get(thread, run)
      .then(({ status }) => {
        if (left) return;
        if (keptRun({ status }) === "join") return send([], {});
        runs.clear(thread, run);
      })
      .catch((error: unknown) => {
        if (keptRun({ error }) === "forget") runs.clear(thread, run);
      });
    return () => {
      left = true;
    };
  }, [client, loading, running, send, thread]);
  return null;
}
