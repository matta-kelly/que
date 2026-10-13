// The run a thread is on: the id of the run, by thread, from when the run is
// made to when it ends in the chat. Kept in the browser's session storage, so
// a reload finds the run again, and a new window does not. A run outlives its
// connection, so this is how the chat picks one up again, and what a stop
// cancels.

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

const key = (thread: string) => `que:run:${thread}`;

/** `storage` hands back where runs are kept. It can throw: a private window, or storage turned off. */
export function runOfThread(storage: () => Storage) {
  const quiet = <T>(read: () => T): T | undefined => {
    try {
      return read();
    } catch {
      return undefined;
    }
  };
  return {
    get: (thread: string) =>
      quiet(() => storage().getItem(key(thread))) ?? undefined,
    set: (thread: string, run: string) =>
      void quiet(() => storage().setItem(key(thread), run)),
    /** With `run`, only when it is still the run of the thread: the end of an old run does not take away the one after it. */
    clear: (thread: string, run?: string) =>
      void quiet(() => {
        if (run === undefined || storage().getItem(key(thread)) === run)
          storage().removeItem(key(thread));
      }),
  };
}

/** The runs of the chats in this browser tab. */
export const runs = runOfThread(() => globalThis.sessionStorage);
