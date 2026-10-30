// What a run is sent. que makes the stream call itself, so a run outlives its
// connection: it is sent to go on when its stream ends, with its events kept,
// so a cut stream is picked up again.

// As the library's own stream call asks for.
export const STREAM_MODE: ("messages" | "updates" | "custom")[] = [
  "messages",
  "updates",
  "custom",
];

/** What the runtime hands the stream call for a run, with the fields read here. */
type Asked<C> = {
  command?: C | null;
  checkpointId?: string | null;
  /** Empty for a message. For a resume after an interrupt, the config of the run it resumes. */
  runConfig?: unknown;
};

/**
 * The options of a run, without the two that are of one call: its signal, and
 * what takes the id of the run. `send` is what the chat picked: each run names
 * it, and what the runtime's own config names is kept over it.
 */
export function runOptions<M, C>(
  messages: M[],
  { command, checkpointId, runConfig }: Asked<C>,
  send: { agent?: string; model?: string },
) {
  const given = (runConfig ?? {}) as {
    configurable?: Record<string, unknown>;
  };
  return {
    input: messages.length ? { messages } : null,
    streamMode: STREAM_MODE,
    onDisconnect: "continue" as const,
    streamResumable: true,
    ...(command != null && { command }),
    ...(checkpointId != null && {
      // The id alone, as the library's own stream call sends it.
      checkpoint: { checkpoint_id: checkpointId } as never,
    }),
    config: {
      ...given,
      configurable: { ...send, ...given.configurable },
    },
  };
}
