"use client";

// Copied from assistant-ui's stopped run element
// (https://www.assistant-ui.com/elements/stopped-run, registry item
// `elements-stopped-run`) and edited. An upgrade is a diff by hand, as with the
// thread. What que changed:
// - no `words`, and no paragraph of them: the thread draws the reply
// - no `onDiscard`, and no button for it
// - a `note` beside the reason, and the whole width for it
// It stops nothing, and knows no run.

import type { ComponentProps, ReactNode } from "react";
import { ArrowRightIcon, SquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono } from "../../assistant-ui/elements/surfaces";

export function StoppedRun({
  reason,
  note,
  onContinue,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "reason" | "note" | "onContinue"
> & {
  reason: string;
  /** One line beside the reason: what the stop left. */
  note?: ReactNode;
  onContinue?: () => void;
}) {
  return (
    <div
      data-slot="stopped-run"
      className={cn("flex w-full items-center gap-2", className)}
      {...props}
    >
      <span
        className={cn(
          field,
          mono,
          "text-muted-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1",
        )}
      >
        <SquareIcon className="size-2.5 fill-current" />
        {reason}
      </span>

      {note && (
        <span className="text-muted-foreground min-w-0 text-xs">{note}</span>
      )}

      <button
        type="button"
        onClick={onContinue}
        className="text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground/95 ms-auto flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
      >
        Continue
        <ArrowRightIcon className="size-3" />
      </button>
    </div>
  );
}
