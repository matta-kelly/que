/**
 * A fact from the provider: the window of a Beam model, read from its model
 * record on the Reflection API. One HTTP call. It gives the window or a reason
 * in words, and does not throw: what to do with no window is for mount to say.
 */

import type { WindowAnswer } from "./fireworks.js";

const TIMEOUT_MS = 5_000;

/** `model` is the provider's own name for it: `Beam-1.0-501B-A23B`. */
export async function beamWindow(
  model: string,
  key: string | undefined,
  fetch: typeof globalThis.fetch,
): Promise<WindowAnswer> {
  if (!key) return { reason: "BEAM_API_KEY is not set" };
  try {
    const res = await fetch(
      `https://api.reflection.ai/openai/v1/models/${model}`,
      {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) return { reason: `Beam answered ${res.status}` };
    const { context_length } = (await res.json()) as {
      context_length?: unknown;
    };
    // A whole number: a share of the window is a count of tokens.
    return Number.isInteger(context_length) && (context_length as number) > 0
      ? { window: context_length as number }
      : { reason: "the model record of Beam has no context_length" };
  } catch (error) {
    return { reason: `Beam did not answer: ${(error as Error).message}` };
  }
}
