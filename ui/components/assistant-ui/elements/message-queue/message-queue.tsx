"use client";

// From the runtime lane of assistant-ui's message queue element
// (https://www.assistant-ui.com/elements/message-queue): the rows are the
// library's own queue. What que changed: no row for the run that is going (the
// thread shows it), and one line of text for a message.

import {
  ComposerPrimitive,
  QueueItemPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { XIcon } from "lucide-react";
import type { FC } from "react";
import { cn } from "@/lib/utils";
import { field, ghostButton, mono } from "../surfaces";

/**
 * Above the composer, the messages sent while a run is going: each waits its
 * turn, and can be taken back. The library holds them in the browser, and
 * sends one when the run before it ends. A stop, or a closed tab, lets them go.
 */
export const MessageQueue: FC = () => {
  const waiting = useAuiState((s) => s.composer.queue.length);
  if (!waiting) return null;
  return (
    <div data-slot="message-queue" className="flex flex-col gap-1.5 px-1 pb-2">
      <span className={cn(mono, "text-muted-foreground px-1")}>
        {waiting} waiting, sent when this reply ends
      </span>
      <ul className="flex flex-col gap-1.5">
        <ComposerPrimitive.Queue>
          {({ queueItem }) => (
            <li
              key={queueItem.id}
              className={cn(
                field,
                "flex items-center gap-2.5 rounded-2xl py-1.5 pr-2 pl-3",
              )}
            >
              <span className="text-foreground/70 min-w-0 flex-1 truncate text-sm">
                <QueueItemPrimitive.Text />
              </span>
              <QueueItemPrimitive.Remove
                aria-label="Take back"
                className={cn(ghostButton, "size-6 shrink-0")}
              >
                <XIcon className="size-3.5" />
              </QueueItemPrimitive.Remove>
            </li>
          )}
        </ComposerPrimitive.Queue>
      </ul>
    </div>
  );
};
