// What the chat knows of a run that did not go the plain way, by thread: that
// its reply was stopped. In memory. `stopped` is as que's server says when the
// chat loads, set by the user's Stop (stop.ts) and cleared when a run starts.

import { create } from "zustand";

type State = {
  stopped: Record<string, boolean>;
};

export const useRunStates = create<State>(() => ({
  stopped: {},
}));

export const setStopped = (thread: string, stopped: boolean) =>
  useRunStates.setState((s) =>
    !!s.stopped[thread] === stopped
      ? s
      : { stopped: { ...s.stopped, [thread]: stopped } },
  );
