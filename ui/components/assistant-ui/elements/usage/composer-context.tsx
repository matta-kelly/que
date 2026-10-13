"use client";

// Copied from `ComposerContext` in assistant-ui's composer element
// (https://www.assistant-ui.com/elements/composer-context, registry item
// `elements-composer`) and edited. An upgrade is a diff by hand, as with the
// thread. What que changed:
// - the parts are handed in, with a label each. The library's are system,
//   tools and messages, which no provider counts apart
// - each count is exact. The library reads its counts as thousands
// - the share to warn at is handed in. The library's is 85 percent, always
// - rows can be put under the parts, and a thing beside the ring
// - the percent has one decimal while it is small, so a chat that has started is not at zero
// - the button is described by the panel, for a screen reader
// It counts nothing, and knows no model and no cost.

import { useId, type ComponentProps, type ReactNode } from "react";
import { percent } from "@/components/assistant-ui/elements/usage/counts";
import { cn } from "@/lib/utils";
import { clamp, pct } from "../../utils/range";
import { floating, ghostButton, mono } from "../surfaces";

export type ContextPart = { label: string; value: number };

// One shade for each part, in order, as the library has for its three.
const SHADES = ["bg-foreground/25", "bg-foreground/45", "bg-foreground/80"];

const exact = (count: number) => count.toLocaleString("en-US");

export function ComposerContext({
  parts,
  total,
  warnAt,
  rows,
  note,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  /** What fills the window, in the order the bar shows it. Three at the most. */
  parts: ContextPart[];
  /** The size of the window. */
  total: number;
  /** The share of the window past which the ring warns. */
  warnAt: number;
  /** Rows under the total: a label and what it is. */
  rows?: { label: string; value: ReactNode }[];
  /** A line at the foot of the panel. */
  note?: ReactNode;
  /** Beside the ring, in the composer. */
  children?: ReactNode;
}) {
  const used = parts.reduce((sum, part) => sum + part.value, 0);
  const fraction = total === 0 ? 0 : used / total;
  const warn = fraction > warnAt;
  const circumference = 2 * Math.PI * 6;
  const panel = useId();

  return (
    <div
      data-slot="composer-context"
      className={cn("group/ctx relative flex items-center", className)}
      {...props}
    >
      <div
        data-slot="composer-context-panel"
        id={panel}
        className={cn(
          floating,
          "absolute end-0 bottom-full z-10 mb-2 flex w-60 origin-bottom-right flex-col gap-3.5 rounded-2xl p-4",
          "transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          "pointer-events-none scale-[0.97] opacity-0",
          "group-hover/ctx:pointer-events-auto group-hover/ctx:scale-100 group-hover/ctx:opacity-100",
          "group-focus-within/ctx:pointer-events-auto group-focus-within/ctx:scale-100 group-focus-within/ctx:opacity-100",
        )}
      >
        <div className="flex items-baseline justify-between">
          <p className="text-[13.5px] font-medium">Context</p>
          <p
            className={cn(
              mono,
              "tabular-nums",
              warn ? "text-red-500 dark:text-red-400" : "text-muted-foreground",
            )}
          >
            {percent(fraction)}
          </p>
        </div>
        <div className="bg-foreground/[0.06] inset-ring-border flex h-[5px] w-full gap-px overflow-hidden rounded-full inset-ring forced-colors:border">
          {parts.map((part, index) => (
            <span
              key={part.label}
              className={cn(
                "h-full transition-[width] duration-700 forced-color-adjust-none motion-reduce:transition-none",
                SHADES[index],
              )}
              style={{ width: `${pct(part.value, total)}%` }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {parts.map((part, index) => (
            <div
              key={part.label}
              className="text-muted-foreground flex items-center gap-2.5 text-[13px]"
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full forced-color-adjust-none",
                  SHADES[index],
                )}
              />
              <span className="flex-1">{part.label}</span>
              <span className={cn(mono, "text-muted-foreground tabular-nums")}>
                {exact(part.value)}
              </span>
            </div>
          ))}
        </div>
        <div className="bg-foreground/[0.06] h-px" />
        <div className="flex flex-col gap-2">
          {[
            { label: "Window", value: `${exact(used)} / ${exact(total)}` },
            ...(rows ?? []),
          ].map((row) => (
            <div
              key={row.label}
              className="text-muted-foreground flex items-center justify-between gap-3 text-[13px]"
            >
              <span>{row.label}</span>
              <span className={cn(mono, "text-muted-foreground tabular-nums")}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
        {note && (
          <p
            className={cn(
              "text-[12px] leading-snug",
              warn ? "text-red-500 dark:text-red-400" : "text-muted-foreground",
            )}
          >
            {note}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Context usage"
        // The panel is what the ring says, for one who does not see it fill.
        aria-describedby={panel}
        className={cn(
          ghostButton,
          "size-8",
          warn && "text-red-500 dark:text-red-400",
        )}
      >
        <svg viewBox="0 0 16 16" className="size-4 -rotate-90" aria-hidden>
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2.5"
            className="stroke-border"
          />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="stroke-current transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamp(fraction, 0, 1))}
          />
        </svg>
      </button>
      {children}
    </div>
  );
}
