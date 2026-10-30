/**
 * The branch rule: how a run's `messages` are read against the messages the
 * thread's conversation holds. The last message the run keeps is found by its
 * id, and set against the conversation's head:
 * - the head: the run goes on the same conversation. Tool results the client
 *   never got after it (pi's result for a call that was aborted) do not count,
 *   so the model still sees that the call was aborted;
 * - an earlier message: the run goes on a fork made at it;
 * - none: the run goes on a new conversation.
 * A message of the head's turn (its assistant records and their tool results,
 * after the last user message) counts as the head: a client that shows a turn
 * as one message knows only some of its records' ids.
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
  // The records from the kept message to the head: one turn when no user message is among them.
  const between = head
    ? held.slice(held.indexOf(keep), held.indexOf(head) + 1)
    : [];
  return keep === head ||
    (between.includes(keep) && between.every((h) => h.message.role !== "user"))
    ? { kind: "same" }
    : { kind: "fork", at: keep.at };
}
