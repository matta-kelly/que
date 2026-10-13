/**
 * A fact from the provider: the window of a Fireworks model, read from its
 * model record. One HTTP call. It gives the window or a reason in words, and
 * does not throw: what to do with no window is for mount to say.
 */

export type WindowAnswer = { window: number } | { reason: string };

const TIMEOUT_MS = 5_000;

/** `model` is the provider's own name for it: `accounts/<account>/models/<model>`. */
export async function fireworksWindow(
  model: string,
  key: string | undefined,
  fetch: typeof globalThis.fetch,
): Promise<WindowAnswer> {
  if (!key) return { reason: "FIREWORKS_API_KEY is not set" };
  try {
    const res = await fetch(`https://api.fireworks.ai/v1/${model}`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { reason: `Fireworks answered ${res.status}` };
    const { contextLength } = (await res.json()) as { contextLength?: unknown };
    return typeof contextLength === "number" && contextLength > 0
      ? { window: contextLength }
      : { reason: "the model record of Fireworks has no contextLength" };
  } catch (error) {
    return { reason: `Fireworks did not answer: ${(error as Error).message}` };
  }
}
