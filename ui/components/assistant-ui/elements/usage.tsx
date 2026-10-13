"use client";

import { getExternalStoreMessages, useAuiState } from "@assistant-ui/react";
import { useMemo, type FC } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatPick } from "@/hooks/use-chat-pick";
import {
  about,
  chatCost,
  money,
  priced,
  rate,
  replyCost,
  type Prices,
} from "@/lib/cost";
import type { Deployment } from "@/lib/que-api";
import { useRunPicks } from "@/lib/run-pick-store";
import { contextUsed, replyUsage, short, type UsageMessage } from "@/lib/usage";

const exact = (count: number) => count.toLocaleString("en-US");

/** The price of each model of the deployment, by its name. A model an older server gave no price for has none. */
const usePrices = (deployment: Deployment | undefined): Prices =>
  useMemo(
    () =>
      Object.fromEntries(
        (deployment?.models ?? []).map((model) => [model.name, model.price]),
      ),
    [deployment],
  );

/**
 * How full the model's window is: the tokens of the chat's last model call,
 * over the window of the model the chat is on. Its hover has what the chat
 * cost. Nothing for a chat with no reply, or on a deployment that lists no
 * models.
 */
export const ContextMeter: FC = () => {
  const { deployment, shown } = useChatPick();
  const prices = usePrices(deployment);
  // The library's own list: the same one from call to call while the chat has no new message.
  const messages = useAuiState((s) => s.thread.messages);
  // Each reply of the chat is a turn: the messages of the server it was made from.
  const turns = useMemo(
    () =>
      messages.map((message) =>
        getExternalStoreMessages<UsageMessage>(message),
      ),
    [messages],
  );
  const used = useMemo(() => contextUsed(turns.flat()), [turns]);
  const cost = useMemo(() => chatCost(turns, prices), [turns, prices]);
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
        <div>
          {exact(used)} of {exact(model.window)} tokens (
          {((used / model.window) * 100).toFixed(1)}%) in the window of{" "}
          {model.name}
        </div>
        {cost && (
          <div>
            this chat: {about(cost.total)}
            {cost.uncounted > 0 &&
              `, ${cost.uncounted} ${cost.uncounted === 1 ? "reply" : "replies"} not counted`}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

/**
 * What a reply took, the model that gave it, and what it cost. A reply is a
 * turn: each model call of it counts. The cost is an estimate, at the price of
 * today, and a reply with a model call that has no price shows none.
 */
export const ReplyUsage: FC = () => {
  // Only the deployment: a reply does not need what the open chat is on, and there is one of these for each reply.
  const deployment = useRunPicks((s) => s.deployment);
  const prices = usePrices(deployment);
  // A selector hands back the same list while the reply has no new message.
  const messages = useAuiState((s) =>
    getExternalStoreMessages<UsageMessage>(s.message),
  );
  const usage = replyUsage(messages);
  if (!usage) return null;
  const cost = replyCost(messages, prices);
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
            ...(cost === undefined ? [] : [money(cost)]),
          ].join(" · ")}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div>
          {exact(usage.input)} in ({exact(usage.cached)} cached) ·{" "}
          {exact(usage.output)} out ({exact(usage.reasoning)} reasoning)
        </div>
        {cost !== undefined && (
          <div>
            {about(cost)}, an estimate: each model call of this turn, at the
            price of today for one million tokens
            {usage.models.map((name) => {
              const price = prices[name];
              return (
                price && (
                  <div key={name}>
                    {name}: {priced(price)}
                    {price.cachedInput !== undefined &&
                      ` · ${rate(price.cachedInput)} cached in`}
                  </div>
                )
              );
            })}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
};
