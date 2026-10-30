// What the chat knows of a run that did not go the plain way, by thread: that
// its reply was stopped, and that the chat is picking its run up again. In
// memory. Nothing writes them now: F1 (stop) and F2 (rejoin) write them.

import { create } from "zustand";

type State = {
  stopped: Record<string, boolean>;
  reconnecting: Record<string, boolean>;
};

export const useRunStates = create<State>(() => ({
  stopped: {},
  reconnecting: {},
}));

export const setStopped = (thread: string, stopped: boolean) =>
  useRunStates.setState((s) =>
    !!s.stopped[thread] === stopped
      ? s
      : { stopped: { ...s.stopped, [thread]: stopped } },
  );

export const setReconnecting = (thread: string, reconnecting: boolean) =>
  useRunStates.setState((s) =>
    !!s.reconnecting[thread] === reconnecting
      ? s
      : { reconnecting: { ...s.reconnecting, [thread]: reconnecting } },
  );
