"use client";

import { useState, useSyncExternalStore } from "react";
import {
  useAgUiInterrupts,
  useAgUiSubmitInterruptResponses,
  type AgUiInterrupt,
} from "@assistant-ui/react-ag-ui";
import { ShieldQuestion, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityStep } from "./activity-step";
import { preview, toolLabel } from "./tool-labels";

/** A decision a call's card can send: LangChain's per-call payload, on its `type`. */
type Decision = "approve" | "edit" | "reject" | "respond";

/** The yes a tool call waits for, as the loaded part carries it: its question, the decisions the op allows, and its id. */
type Approval = {
  id?: string;
  prompt?: string;
  decisions?: string[];
  approved?: boolean;
};

/** The decisions a card offers when the wire names none: the door's default. */
const DEFAULT_DECISIONS: Decision[] = ["approve", "edit", "reject"];

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

/** The answer a card holds, if any: the store's answer for its interrupt. */
function useHeld(id: string | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => heldBy(id),
    () => undefined,
  );
}

/** The decisions an interrupt's op allows, as its metadata lists them. */
function decisionsOf(interrupt: AgUiInterrupt | undefined): Decision[] {
  const named = (interrupt?.metadata as { decisions?: unknown } | undefined)
    ?.decisions;
  return Array.isArray(named)
    ? named.filter(
        (decision): decision is Decision =>
          DEFAULT_DECISIONS.includes(decision as Decision) ||
          decision === "respond",
      )
    : DEFAULT_DECISIONS;
}

// A tool call: its label, then inputs and result when expanded. A call that
// waits for the user's yes shows what it will run, and asks.
export function ToolStep({
  toolCallId,
  toolName,
  args,
  result,
  isError,
  status,
  approval,
}: {
  toolCallId?: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  status: { type: string };
  approval?: Approval;
}) {
  // The run's pending interrupts, as the app's runtime holds them: a call whose
  // schema the library's own gate does not carry still shows its card here.
  const pending = useAgUiInterrupts();
  const live = pending.find((interrupt) =>
    toolCallId ? interrupt.toolCallId === toolCallId : false,
  );
  if (result === undefined && (approval || live))
    return (
      <ApprovalStep
        toolName={toolName}
        args={args}
        approval={approval}
        live={live}
        pending={pending}
      />
    );
  return (
    <ActivityStep
      icon={<Wrench />}
      label={toolLabel(toolName, args)}
      running={status.type === "running"}
      failed={!!isError}
    >
      <pre className="font-mono whitespace-pre-wrap">{preview(args)}</pre>
      {result !== undefined && (
        <pre className="mt-2 font-mono whitespace-pre-wrap">
          {preview(result)}
        </pre>
      )}
    </ActivityStep>
  );
}

// A tool call that waits for a yes: the op and the input it will run with, and
// one control per decision the op allows. An answer waits here until every
// waiting call of the reply has one, and then one resume carries them all.
function ApprovalStep({
  toolName,
  args,
  approval,
  live,
  pending,
}: {
  toolName: string;
  args: unknown;
  approval?: Approval;
  live?: AgUiInterrupt;
  pending: readonly AgUiInterrupt[];
}) {
  const submit = useAgUiSubmitInterruptResponses();
  const id = approval?.id ?? live?.id;
  const decisions = approval?.decisions ?? decisionsOf(live);
  const holds = decisions.filter(
    (decision): decision is Decision =>
      DEFAULT_DECISIONS.includes(decision as Decision) ||
      decision === "respond",
  );
  const held = useHeld(id);
  const [form, setForm] = useState<Decision | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [json, setJson] = useState("");

  const answer = (payload: Record<string, unknown>) => {
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

  return (
    <div
      data-slot="tool-approval"
      className="border-border my-2 rounded-lg border p-3 text-sm"
    >
      <div className="flex items-center gap-2 font-medium">
        <ShieldQuestion className="size-4" />
        {approval?.prompt ?? live?.message ?? `Run ${toolName}?`}
      </div>
      <pre className="text-muted-foreground mt-2 font-mono text-xs whitespace-pre-wrap">
        {preview(args)}
      </pre>
      {held ? (
        <p className="text-muted-foreground mt-2">
          {held.type === "approve"
            ? "Approved"
            : held.type === "edit"
              ? "Edited"
              : held.type === "respond"
                ? `Responded: ${String(held.message)}`
                : `Rejected${held.message ? `: ${String(held.message)}` : ""}`}
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            {holds.includes("approve") && (
              <Button size="sm" onClick={() => answer({ type: "approve" })}>
                Approve
              </Button>
            )}
            {holds.includes("reject") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setForm("reject")}
              >
                Reject
              </Button>
            )}
            {holds.includes("edit") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setJson(JSON.stringify(args ?? {}, null, 2));
                  setForm("edit");
                }}
              >
                Edit
              </Button>
            )}
            {holds.includes("respond") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setForm("respond")}
              >
                Respond
              </Button>
            )}
          </div>
          {form === "reject" && (
            <div className="mt-2 flex gap-2">
              <input
                className="border-border min-w-0 flex-1 rounded border px-2 py-1"
                placeholder="Why reject? (optional)"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <Button
                size="sm"
                onClick={() =>
                  answer({
                    type: "reject",
                    ...(message ? { message } : {}),
                  })
                }
              >
                Send reject
              </Button>
            </div>
          )}
          {form === "edit" && (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                className="border-border min-h-20 rounded border px-2 py-1 font-mono text-xs"
                placeholder="The args as JSON"
                value={json}
                onChange={(event) => setJson(event.target.value)}
              />
              <Button
                size="sm"
                onClick={() => {
                  let edited: unknown;
                  try {
                    edited = JSON.parse(json);
                  } catch {
                    return;
                  }
                  answer({
                    type: "edit",
                    edited_action: { name: toolName, args: edited },
                  });
                }}
              >
                Send edit
              </Button>
            </div>
          )}
          {form === "respond" && (
            <div className="mt-2 flex gap-2">
              <input
                className="border-border min-w-0 flex-1 rounded border px-2 py-1"
                placeholder="Your response"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <Button
                size="sm"
                disabled={!message}
                onClick={() => answer({ type: "respond", message })}
              >
                Send response
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
