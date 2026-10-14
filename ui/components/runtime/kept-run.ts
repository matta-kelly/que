// What a chat does with the run it has kept (`run-of-thread`) when it is
// opened: it asks the server for that run, and goes by the answer.

/** What the server said of the run: its status, or the error of the call. */
export type Look = { status: string } | { error: unknown };

/**
 * `join`: the run is going, and the chat picks it up. `forget`: the run has
 * ended, or the server does not have it, so it is no run to join and is let go
 * of. `keep`: a server that does not answer says nothing of the run, and what
 * is kept stays for the next visit.
 */
export function keptRun(look: Look): "join" | "forget" | "keep" {
  if ("status" in look)
    return look.status === "pending" || look.status === "running"
      ? "join"
      : "forget";
  return (look.error as { status?: number } | null)?.status === 404
    ? "forget"
    : "keep";
}
