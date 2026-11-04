"use client";

// The answer a waiting tool call takes: the interrupt the wire sends for it, and
// the one resume that answers a batch of them. The default card answers through
// here, and so does a toolkit entry, whose part the library's approval seam no
// longer carries once the interrupt's schema asks for a decision of its own.

import { useSyncExternalStore } from "react";
import {
  useAgUiInterrupts,
  useAgUiSubmitInterruptResponses,
  type AgUiInterrupt,
} from "@assistant-ui/react-ag-ui";

/** A decision a call's card can send: LangChain's per-call payload, on its `type`. */
export type Decision = "approve" | "edit" | "reject" | "respond";

/** The decisions a card offers when the wire names none: the door's default. */
const DEFAULT_DECISIONS: readonly Decision[] = ["approve", "edit", "reject"];

/** The yes a tool call waits for, as its part carries it: its id, its question, and the decisions the op allows. */
export type Approval = {
  id: string;
  prompt?: string;
  decisions?: Decision[];
};

/** Whether a name the wire gives is a decision a card can send. */
const isDecision = (name: string): name is Decision =>
  DEFAULT_DECISIONS.includes(name as Decision) || name === "respond";

/**
 * The decisions an interrupt's metadata lists, as far as a card can send them: none when it lists none. A loaded
 * chat carries these onto the call's approval, and a card asks its op the same way.
 */
export function listedDecisions(interrupt: AgUiInterrupt): Decision[] {
  const named = (interrupt.metadata as { decisions?: unknown } | undefined)
    ?.decisions;
  return Array.isArray(named)
    ? named
        .filter((decision): decision is string => typeof decision === "string")
        .filter(isDecision)
    : [];
}

/** The decisions a card offers for an interrupt: the ones its op lists, or the door's default when it lists none. */
export function decisionsOf(interrupt: AgUiInterrupt | undefined): Decision[] {
  const listed = interrupt ? listedDecisions(interrupt) : [];
  return listed.length ? listed : [...DEFAULT_DECISIONS];
}

/**
 * The pending interrupt that names a tool call, as the app's runtime holds it: a call whose schema the library's own
 * gate does not carry still waits here.
 */
export function useInterrupt(toolCallId?: string): AgUiInterrupt | undefined {
  const pending = useAgUiInterrupts();
  return pending.find((interrupt) =>
    toolCallId ? interrupt.toolCallId === toolCallId : false,
  );
}

/**
 * The answer each waiting interrupt holds, by its id, until every interrupt of the batch has one: one resume answers
 * the batch, so a card's answer waits on the other cards. The store is shared by the cards because they sit in one
 * reply, and it is empty between batches.
 */
const answers = new Map<string, Record<string, unknown>>();
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

function hold(id: string, payload: Record<string, unknown>) {
  answers.set(id, payload);
  changed();
}

function release() {
  answers.clear();
  changed();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const heldBy = (id: string | undefined) => (id ? answers.get(id) : undefined);

/** The answer a waiting call holds, if any: the store's answer for its interrupt. */
export function useHeldAnswer(id: string | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => heldBy(id),
    () => undefined,
  );
}

/**
 * The way to answer a waiting call: hold its answer, and send the batch's one resume once every interrupt the run
 * waits on holds one. A card answers through here, and so does a toolkit entry.
 */
export function useAnswer(
  id: string | undefined,
): (payload: Record<string, unknown>) => void {
  const submit = useAgUiSubmitInterruptResponses();
  const pending = useAgUiInterrupts();
  return (payload: Record<string, unknown>) => {
    if (!id) return;
    hold(id, payload);
    // The batch resumes only when each interrupt the run waits on holds an answer.
    if (
      pending.length &&
      pending.every((interrupt) => answers.has(interrupt.id))
    )
      void submit(
        pending.map((interrupt) => ({
          interruptId: interrupt.id,
          status: "resolved" as const,
          payload: answers.get(interrupt.id)!,
        })),
      )
        .catch(() => {})
        .finally(release);
  };
}
