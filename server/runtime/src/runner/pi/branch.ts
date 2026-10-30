/**
 * The branch rule: how a run's `messages` are read against the messages the
 * thread's conversation holds. The last message the run keeps is found by its
 * id, and set against the conversation's head:
 * - the head: the run goes on the same conversation. Tool results the client
 *   never got after it (pi's result for a call that was aborted) do not count,
 *   so the model still sees that the call was aborted;
 * - an earlier message: the run goes on a fork made at it;
 * - none: the run goes on a new conversation.
 * A known record of a turn (its assistant records and their tool results,
 * up to the next user message) stands for the whole turn, so the kept message
 * is the turn's last record: a client that shows a turn as one message knows
 * only some of its records' ids. A record of the head's turn is the head.
 * The last message the run keeps is the last one the thread knows before the
 * new user message. A user message the thread already holds is sent again:
 * by the run that sent it, a resend, which makes no run; by a new run, a
 * regenerate, which keeps the messages before it.
 */

import type { EntryId } from "@earendil-works/pi-durable";
import type { Held } from "./agui.js";

export type Branch =
  | { kind: "resend" }
  | { kind: "same" }
  | { kind: "fork"; at: EntryId }
  | { kind: "new" };

/** What a run does with the conversation that holds `held`: `before` are the ids of the messages before its user message `last`. */
export function branchOf(
  held: readonly Held[],
  {
    runId,
    before,
    last,
  }: { runId: string; before: readonly string[]; last: string },
): Branch {
  const place = held.findIndex((h) => h.message.id === last);
  if (place >= 0 && held[place]?.run === runId) return { kind: "resend" };
  const known = (id: string) => held.find((h) => h.message.id === id);
  const keep =
    place >= 0
      ? held[place - 1]
      : [...before]
          .reverse()
          .map(known)
          .find((h) => h !== undefined);
  if (!keep) return { kind: "new" };
  const sent = new Set([...before, last]);
  const head = [...held]
    .reverse()
    .find((h) => h.message.role !== "tool" || sent.has(h.message.id));
  // A turn's record stands for the turn: the kept message is its last, before the next user message.
  const at = held.indexOf(keep);
  const next = held.findIndex((h, i) => i > at && h.message.role === "user");
  if (keep.message.role !== "user" && next < 0) return { kind: "same" };
  const kept = keep.message.role === "user" ? keep : held[next - 1]!;
  return kept === head ? { kind: "same" } : { kind: "fork", at: kept.at };
}
