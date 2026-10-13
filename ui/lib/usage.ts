// What a chat used, counted from the messages the server sends. Each reply of
// the model has its usage as the provider gave it, and que's stamp: the name of
// the model config that gave it.

/** A message of the server, with the fields read here. */
export type UsageMessage = {
  type?: string;
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    input_token_details?: { cache_read?: number };
    output_token_details?: { reasoning?: number };
  };
  response_metadata?: { que?: { model?: string } };
};

const usageOf = (message: UsageMessage) =>
  message.type === "ai" ? message.usage_metadata : undefined;

export type ContextParts = {
  /** Tokens in that the provider read from its cache. */
  cached: number;
  /** The rest of tokens in. */
  fresh: number;
  /** Tokens out. */
  reply: number;
};

/**
 * Where the model's window went: the parts of the chat's last model call, as
 * the provider counts them. The provider counts cached tokens as a part of
 * tokens in. The last call is the size of the chat: each call sends the chat
 * again, so a sum over the chat would count it many times.
 */
export function contextParts(
  messages: UsageMessage[],
): ContextParts | undefined {
  const last = messages.findLast((message) => usageOf(message));
  if (!last) return undefined;
  const usage = usageOf(last)!;
  const cached = usage.input_token_details?.cache_read ?? 0;
  return {
    cached,
    fresh: Math.max(0, (usage.input_tokens ?? 0) - cached),
    reply: usage.output_tokens ?? 0,
  };
}

/** How full the model's window is: the sum of the parts of the chat's last model call. */
export function contextUsed(messages: UsageMessage[]): number | undefined {
  const parts = contextParts(messages);
  return parts && parts.cached + parts.fresh + parts.reply;
}

/**
 * The share of the window past which the meter warns: the one the agent sends
 * the old part of a chat as a summary at, and for an agent that does not
 * summarize, the share at which a window is nearly full.
 */
export const NEARLY_FULL = 0.85;
export const warnShare = (summarizeAt: number | undefined) =>
  summarizeAt ?? NEARLY_FULL;

export type ReplyUsage = {
  /** Of the last model call of the turn. */
  input: number;
  /** Summed over the model calls of the turn, as `cached` and `reasoning` are. */
  output: number;
  cached: number;
  reasoning: number;
  /** The model configs that gave the turn, each one time, in order. */
  models: string[];
};

/** What one reply took. A reply is a turn: each model call from the user's message to the next. */
export function replyUsage(messages: UsageMessage[]): ReplyUsage | undefined {
  const calls = messages.filter((message) => usageOf(message));
  if (!calls.length) return undefined;
  const sum = (count: (message: UsageMessage) => number | undefined) =>
    calls.reduce((total, message) => total + (count(message) ?? 0), 0);
  return {
    input: calls.at(-1)!.usage_metadata!.input_tokens ?? 0,
    output: sum((m) => m.usage_metadata!.output_tokens),
    cached: sum((m) => m.usage_metadata!.input_token_details?.cache_read),
    reasoning: sum((m) => m.usage_metadata!.output_token_details?.reasoning),
    models: [
      ...new Set(calls.flatMap((m) => m.response_metadata?.que?.model ?? [])),
    ],
  };
}

/** A count, written short: `950`, `2.9k`, `12k`, `1.2M`. One decimal only below ten of a unit. */
export function short(count: number): string {
  if (count < 1_000) return String(count);
  const [value, unit] =
    count < 999_500 ? [count / 1_000, "k"] : [count / 1_000_000, "M"];
  const text = value < 9.95 ? value.toFixed(1) : String(Math.round(value));
  return text.replace(/\.0$/, "") + unit;
}
