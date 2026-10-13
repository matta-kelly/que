import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireworksWindow } from "./fireworks.js";

// The provider's own answer for one model, saved.
const record = readFileSync(
  join(import.meta.dirname, "fixtures/fireworks-model.json"),
  "utf8",
);
const MODEL = "accounts/fireworks/models/glm-5p3-flash";

/** A `fetch` that answers one way, and keeps what it was asked. */
function answering(answer: () => Response | Promise<Response>) {
  const asked: { url: string; auth: string | null }[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    asked.push({
      url: String(url),
      auth: new Headers(init?.headers).get("authorization"),
    });
    return answer();
  };
  return { fetch, asked };
}

test("fireworksWindow reads contextLength of the model record", async () => {
  const { fetch, asked } = answering(() => new Response(record));
  assert.deepEqual(await fireworksWindow(MODEL, "a-key", fetch), {
    window: 1_048_576,
  });
  assert.deepEqual(asked, [
    { url: `https://api.fireworks.ai/v1/${MODEL}`, auth: "Bearer a-key" },
  ]);
});

test("fireworksWindow gives a reason for an error status, a record with no window, and no answer", async () => {
  const reasonOf = async (fetch: typeof globalThis.fetch, key = "a-key") => {
    const got = await fireworksWindow(MODEL, key, fetch);
    assert.ok("reason" in got, JSON.stringify(got));
    return got.reason;
  };
  assert.match(
    await reasonOf(answering(() => new Response("no", { status: 404 })).fetch),
    /Fireworks answered 404/,
  );
  assert.match(
    await reasonOf(answering(() => new Response('{"name":"x"}')).fetch),
    /no contextLength/,
  );
  assert.match(
    await reasonOf(answering(() => new Response('{"contextLength":0}')).fetch),
    /no contextLength/,
  );
  assert.match(
    await reasonOf(answering(() => new Response("<html>")).fetch),
    /Fireworks did not answer/,
  );
  assert.match(
    await reasonOf(async () => {
      throw new Error("connect ETIMEDOUT");
    }),
    /Fireworks did not answer: connect ETIMEDOUT/,
  );
  // With no key the provider is not asked.
  const unasked = answering(() => new Response(record));
  assert.match(
    await reasonOf(unasked.fetch, ""),
    /FIREWORKS_API_KEY is not set/,
  );
  assert.deepEqual(unasked.asked, []);
});
