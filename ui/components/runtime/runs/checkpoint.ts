// Where a run starts again to redo part of a chat. The server keeps a
// checkpoint for each step of a thread, and a run that names one goes on from
// there: for a reply made again, from the step that held the messages before it.

/** A state of a thread's history, with the fields read here. */
export type HistoryState = {
  checkpoint: { checkpoint_id?: string | null };
  values?: { messages?: { id?: string }[] } | unknown;
};

/**
 * The checkpoint of the state that holds exactly these messages, by id.
 * `history` is newest first, as the server gives it, so of two such states it
 * is the newest: the one whose next step is the model's.
 */
export function checkpointFor(
  history: HistoryState[],
  parents: { id?: string }[],
): string | null {
  if (parents.some((message) => !message.id)) return null;
  const state = history.find(({ values }) => {
    const held =
      (values as { messages?: { id?: string }[] } | undefined)?.messages ?? [];
    return (
      held.length === parents.length &&
      held.every((message, i) => message.id === parents[i].id)
    );
  });
  return state?.checkpoint.checkpoint_id ?? null;
}
