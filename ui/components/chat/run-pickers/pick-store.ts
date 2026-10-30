// The picks of the chats open in this browser, and the deployment they are
// picked from. Outside React, because the thread list reads it when a chat's
// first message makes its thread. The saved copy of a pick is the thread's
// record on que's server.

import { create } from "zustand";
import { QUE_API, fetcher, type Deployment } from "@/lib/que-api";
import type { RunPick } from "@/components/chat/run-pickers/pick";

type State = {
  deployment: Deployment | undefined;
  /** By thread: its id on the server, or its local id while it has none. */
  picks: Record<string, RunPick>;
};

export const useRunPicks = create<State>(() => ({
  deployment: undefined,
  picks: {},
}));

const NO_PICK: RunPick = {};
export const pickOf = (state: State, thread: string | undefined) =>
  (thread && state.picks[thread]) || NO_PICK;

/** Set the pick of a thread, in whole. */
export const rememberPick = (thread: string, pick: RunPick) =>
  useRunPicks.setState((s) => ({ picks: { ...s.picks, [thread]: pick } }));

/** Change fields of the pick of a thread. */
export const changePick = (thread: string, change: RunPick) =>
  rememberPick(thread, {
    ...pickOf(useRunPicks.getState(), thread),
    ...change,
  });

export async function loadDeployment() {
  if (useRunPicks.getState().deployment) return;
  const deployment = await fetcher<Deployment>(QUE_API.deployment);
  useRunPicks.setState({ deployment });
}
