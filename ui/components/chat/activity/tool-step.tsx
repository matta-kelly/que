"use client";

import { useState } from "react";
import { useAui } from "@assistant-ui/react";
import { ShieldQuestion, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityStep } from "./activity-step";
import { preview, toolLabel } from "./tool-labels";

/** The yes a tool call waits for, as the part carries it: its question, and the answer once one is given. */
type Approval = { prompt?: string; approved?: boolean };

// A tool call: its label, then inputs and result when expanded. A call that
// waits for the user's yes shows what it will run, and asks.
export function ToolStep({
  toolName,
  args,
  result,
  isError,
  status,
  approval,
}: {
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  status: { type: string };
  approval?: Approval;
}) {
  if (approval && result === undefined)
    return <ApprovalStep toolName={toolName} args={args} approval={approval} />;
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
// the two answers. The answer resumes the run, which runs the op or refuses it.
function ApprovalStep({
  toolName,
  args,
  approval,
}: {
  toolName: string;
  args: unknown;
  approval: Approval;
}) {
  const aui = useAui();
  const [sending, setSending] = useState(false);
  const answered = approval.approved !== undefined;
  const answer = (approved: boolean) => {
    setSending(true);
    aui
      .part()
      .respondToToolApproval({ approved })
      .catch(() => setSending(false));
  };
  return (
    <div
      data-slot="tool-approval"
      className="border-border my-2 rounded-lg border p-3 text-sm"
    >
      <div className="flex items-center gap-2 font-medium">
        <ShieldQuestion className="size-4" />
        {approval.prompt ?? `Run ${toolName}?`}
      </div>
      <pre className="text-muted-foreground mt-2 font-mono text-xs whitespace-pre-wrap">
        {preview(args)}
      </pre>
      {answered ? (
        <p className="text-muted-foreground mt-2">
          {approval.approved ? "Approved" : "Declined"}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={sending} onClick={() => answer(true)}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={sending}
            onClick={() => answer(false)}
          >
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}
