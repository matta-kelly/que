"use client";

// Copied from assistant-ui's connection state element
// (https://www.assistant-ui.com/elements/connection-state, registry item
// `elements-connection-state`) and edited. An upgrade is a diff by hand, as with
// the thread. What que changed:
// - no `resumed` phase, and no `attempt` and `resumedTokens`: que counts neither
//   the tries nor the tokens of a pick up
// - the text of `dropped` says the run goes on, and not that it kept going
// - it is a `status` for a screen reader, so a change of phase is said
// - one thin line: less padding, a smaller corner, and text that does not wrap
// It makes no request, and knows no run.

import type { ComponentProps } from "react";
import { CloudOffIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { paper } from "../../assistant-ui/elements/surfaces";

export type ConnectionPhase = "online" | "dropped" | "reconnecting";

export function ConnectionState({
  phase,
  onRetry,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "phase" | "onRetry" | "role"> & {
  phase: ConnectionPhase;
  onRetry?: () => void;
}) {
  if (phase === "online") return null;

  return (
    <div
      data-slot="connection-state"
      role="status"
      className={cn(
        paper,
        "fade-in slide-in-from-top-1 animate-in flex w-fit max-w-full items-center gap-2 rounded-full px-3 py-1 whitespace-nowrap duration-300",
        className,
      )}
      {...props}
    >
      {phase === "dropped" && (
        <>
          <CloudOffIcon className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-[13px]">
            Connection lost. The run goes on.
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground/95 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
          >
            Reconnect
          </button>
        </>
      )}

      {phase === "reconnecting" && (
        <>
          <Loader2Icon className="text-muted-foreground size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <span className="min-w-0 flex-1 text-[13px]">Reconnecting</span>
        </>
      )}
    </div>
  );
}
