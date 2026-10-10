"use client";

import { Wrench } from "lucide-react";
import { ActivityStep } from "./activity-step";
import { preview, toolLabel } from "./tool-labels";

// A tool call: its label, then inputs and result when expanded.
export function ToolStep({
  toolName,
  args,
  result,
  isError,
  status,
}: {
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  status: { type: string };
}) {
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
