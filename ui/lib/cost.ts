// What a chat cost, counted from the usage and the stamp on each reply and the
// price of the model. An estimate: the price is the one of today, and no cost
// is stored in any place.

import type { ModelPrice } from "./que-api.ts";
import type { UsageMessage } from "./usage.ts";

type Usage = NonNullable<UsageMessage["usage_metadata"]>;

/** The price of each model, by the name of its config. A model with none has no key, or `undefined`. */
export type Prices = Record<string, ModelPrice | undefined>;

const PER = 1_000_000;

const usageOf = (message: UsageMessage) =>
  message.type === "ai" ? message.usage_metadata : undefined;

/**
 * Dollars for one model call. The provider counts cached tokens as a part of
 * tokens in, so they are taken out of tokens in and priced apart. Reasoning
 * tokens are a part of tokens out.
 */
export function callCost(usage: Usage, price: ModelPrice): number {
  const cached = usage.input_token_details?.cache_read ?? 0;
  // A provider that counts cached tokens apart from tokens in gives a rest under zero.
  const rest = Math.max(0, (usage.input_tokens ?? 0) - cached);
  return (
    (rest * price.input +
      cached * (price.cachedInput ?? price.input) +
      (usage.output_tokens ?? 0) * price.output) /
    PER
  );
}

/**
 * Dollars for one reply: each model call of the turn at the price of the model
 * its stamp names. Nothing when a call has no stamp, or a stamp with no price:
 * a part of the sum would read as the cost of the reply.
 */
export function replyCost(
  messages: UsageMessage[],
  prices: Prices,
): number | undefined {
  const calls = messages.filter((message) => usageOf(message));
  if (!calls.length) return undefined;
  let total = 0;
  for (const call of calls) {
    const model = call.response_metadata?.que?.model;
    // Read as an own key, so a model named `constructor` has no price.
    const price =
      model !== undefined && Object.hasOwn(prices, model)
        ? prices[model]
        : undefined;
    if (!price) return undefined;
    total += callCost(call.usage_metadata!, price);
  }
  return total;
}

export type ChatCost = {
  /** Summed over the turns that have a cost. */
  total: number;
  /** How many turns with a model call have no cost. */
  uncounted: number;
};

/** Dollars for a chat. A turn with no model call yet is in neither number, and a chat of such turns has no cost. */
export function chatCost(
  turns: UsageMessage[][],
  prices: Prices,
): ChatCost | undefined {
  const called = turns.filter((turn) => turn.some((m) => usageOf(m)));
  if (!called.length) return undefined;
  const costs = called.map((turn) => replyCost(turn, prices));
  return {
    total: costs.reduce<number>((total, cost) => total + (cost ?? 0), 0),
    uncounted: costs.filter((cost) => cost === undefined).length,
  };
}

/**
 * A cost, written with more decimals the less it is: `$0.00`, `<$0.0001`,
 * `$0.0012`, `$0.012`, `$1.23`. The form is the one of the rounded cost, so a
 * cost that rounds up to a limit is written in the form above it: 0.00996 is
 * `$0.010`, and not `$0.0100`. Under 0.0001 nothing rounds up.
 */
export function money(dollars: number): string {
  if (dollars === 0) return "$0.00";
  if (dollars < 0.0001) return "<$0.0001";
  for (const [decimals, limit] of [
    [4, 0.01],
    [3, 1],
  ]) {
    const text = dollars.toFixed(decimals);
    if (Number(text) < limit) return "$" + text;
  }
  return "$" + dollars.toFixed(2);
}

/**
 * One number of a price, with each of its digits and two decimals at the least: `$0.50`, `$0.075`.
 * It is not rounded as a cost is: a cost is counted at the exact price, so that is the one shown.
 */
export const rate = (dollars: number) => {
  // Six decimals holds any price for one million tokens, and cuts the tail of a float.
  const [whole, decimals] = dollars.toFixed(6).split(".");
  return `$${whole}.${decimals.replace(/0+$/, "").padEnd(2, "0")}`;
};

/** A price, written for a person: `$0.15 in · $0.50 out`, for one million tokens. */
export const priced = (price: ModelPrice) =>
  `${rate(price.input)} in · ${rate(price.output)} out`;

/** A cost in a sentence, said as the estimate it is: `about $0.012`, and `under $0.0001` for the least. */
export const about = (dollars: number) => {
  const text = money(dollars);
  return text.startsWith("<") ? `under ${text.slice(1)}` : `about ${text}`;
};
