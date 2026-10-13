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

/**
 * How full the model's window is: tokens in plus out of the last model call.
 * Not a sum over the chat: each call sends the chat again, so the last call is
 * the size of the chat.
 */
export function contextUsed(messages: UsageMessage[]): number | undefined {
  const last = messages.findLast((message) => usageOf(message));
  if (!last) return undefined;
  const usage = usageOf(last)!;
  return (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
}

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
