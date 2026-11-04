"use client";

import { useState } from "react";
import type { AgUiInterrupt } from "@assistant-ui/react-ag-ui";
import { ShieldQuestion, Wrench } from "lucide-react";
import {
  decisionsOf,
  useAnswer,
  useHeldAnswer,
  useInterrupt,
  type Approval,
  type Decision,
} from "@/components/runtime/approval";
import { Button } from "@/components/ui/button";
import { ActivityStep } from "./activity-step";
import { preview, toolLabel } from "./tool-labels";

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
  // The run's pending interrupt on this call, as the app's runtime holds it: a
  // call whose schema the library's own gate does not carry still shows its
  // card here, and answers through the app's approval hooks.
  const live = useInterrupt(toolCallId);
  if (result === undefined && (approval || live))
    return (
      <ApprovalStep
        toolName={toolName}
        args={args}
        approval={approval}
        live={live}
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
}: {
  toolName: string;
  args: unknown;
  approval?: Approval;
  live?: AgUiInterrupt;
}) {
  const id = approval?.id ?? live?.id;
  const holds = approval?.decisions ?? decisionsOf(live);
  const held = useHeldAnswer(id);
  const answer = useAnswer(id);
  const [form, setForm] = useState<Decision | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [json, setJson] = useState("");

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
