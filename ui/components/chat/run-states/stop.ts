import { threads } from "@/components/runtime/que-client";
import { setStopped } from "./store";

/**
 * The user's Stop: the thread's run is stopped on que's server, and the chat
 * says so once it is. Only the Stop button calls it: a chat that is left is
 * not stopped, as its runtime's teardown cancels the run in the page only.
 */
export async function stop(thread: string) {
  await threads.stop(thread);
  setStopped(thread, true);
}
