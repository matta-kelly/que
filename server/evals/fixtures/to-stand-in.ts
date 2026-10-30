/**
 * Loaded before a command (`node --import`): when `FIREWORKS_STAND_IN` is
 * set, each request to Fireworks' base URL goes to that URL in its place, the
 * path under it kept. pi-ai's model for a config has Fireworks' base URL, and
 * reads no setting that changes it. Unset, it changes nothing.
 */

const FIREWORKS = "https://api.fireworks.ai/inference/v1";
const standIn = process.env.FIREWORKS_STAND_IN;

if (standIn) {
  const send = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? undefined : String(input);
    return url?.startsWith(FIREWORKS)
      ? send(standIn + url.slice(FIREWORKS.length), init)
      : send(input, init);
  };
}
