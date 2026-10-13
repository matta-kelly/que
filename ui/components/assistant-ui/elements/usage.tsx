"use client";

import { getExternalStoreMessages, useAuiState } from "@assistant-ui/react";
import type { FC } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatPick } from "@/hooks/use-chat-pick";
import { contextUsed, replyUsage, short, type UsageMessage } from "@/lib/usage";

const exact = (count: number) => count.toLocaleString("en-US");

/**
 * How full the model's window is: the tokens of the chat's last model call,
 * over the window of the model the chat is on. Nothing for a chat with no
 * reply, or on a deployment that lists no models.
 */
export const ContextMeter: FC = () => {
  const { deployment, shown } = useChatPick();
  const used = useAuiState((s) =>
    contextUsed(
      s.thread.messages.flatMap((message) =>
        getExternalStoreMessages<UsageMessage>(message),
      ),
    ),
  );
  const model = deployment?.models.find((m) => m.name === shown.model);
  if (used === undefined || !model) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-slot="context-meter"
          className="text-muted-foreground cursor-default px-2 text-xs tabular-nums"
        >
          {short(used)} / {short(model.window)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {exact(used)} of {exact(model.window)} tokens (
        {((used / model.window) * 100).toFixed(1)}%) in the window of{" "}
        {model.name}
      </TooltipContent>
    </Tooltip>
  );
};

/** What a reply took, and the model that gave it. A reply is a turn: each model call of it counts. */
export const ReplyUsage: FC = () => {
  // A selector hands back the same list while the reply has no new message.
  const messages = useAuiState((s) =>
    getExternalStoreMessages<UsageMessage>(s.message),
  );
  const usage = replyUsage(messages);
  if (!usage) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-slot="reply-usage"
          className="text-muted-foreground/70 ms-2 cursor-default text-xs tabular-nums"
        >
          {[
            ...usage.models,
            `${short(usage.input)} in`,
            `${short(usage.output)} out`,
          ].join(" · ")}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {exact(usage.input)} in ({exact(usage.cached)} cached) ·{" "}
        {exact(usage.output)} out ({exact(usage.reasoning)} reasoning)
      </TooltipContent>
    </Tooltip>
  );
};
