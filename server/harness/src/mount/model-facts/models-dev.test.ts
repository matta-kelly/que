import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { modelsDevPrices } from "./models-dev.js";

// A part of the database's own answer, saved: three models of Fireworks, and one with no cost.
const answer = readFileSync(
  join(import.meta.dirname, "fixtures/models-dev.json"),
  "utf8",
);

test("modelsDevPrices reads the cost of a model of a provider", async () => {
  let calls = 0;
  const prices = modelsDevPrices(async (url) => {
    calls++;
    assert.equal(String(url), "https://models.dev/api.json");
    return new Response(answer);
  });
  assert.deepEqual(
    await prices("fireworks-ai", "accounts/fireworks/models/glm-5p3-flash"),
    { price: { input: 0.15, output: 0.5, cachedInput: 0.03 } },
  );
  assert.deepEqual(
    await prices("fireworks-ai", "accounts/fireworks/models/minimax-m3"),
    { price: { input: 0.3, output: 1.2, cachedInput: 0.06 } },
  );
  assert.equal(calls, 1, "one call for every model of a mount");
});

test("modelsDevPrices gives a reason for a model that is not there, and for an answer that is not the shape", async () => {
  const reasonOf = async (
    fetch: typeof globalThis.fetch,
    provider = "fireworks-ai",
    model = "accounts/fireworks/models/glm-5p3-flash",
  ) => {
    const got = await modelsDevPrices(fetch)(provider, model);
    assert.ok("reason" in got, JSON.stringify(got));
    return got.reason;
  };
  const real: typeof globalThis.fetch = async () => new Response(answer);
  assert.match(
    await reasonOf(real, "fireworks-ai", "accounts/fireworks/models/nope"),
    /models\.dev has no model "accounts\/fireworks\/models\/nope" of "fireworks-ai"/,
  );
  assert.match(
    await reasonOf(real, "nowhere-ai"),
    /models\.dev has no model .* of "nowhere-ai"/,
  );
  assert.match(
    await reasonOf(real, "fireworks-ai", "accounts/fireworks/models/no-cost"),
    /models\.dev has no price for/,
  );
  assert.match(
    await reasonOf(async () => new Response("[]")),
    /models\.dev has no model/,
  );
  assert.match(
    await reasonOf(async () => new Response("<html>")),
    /models\.dev did not answer/,
  );
  assert.match(
    await reasonOf(async () => new Response("no", { status: 503 })),
    /models\.dev answered 503/,
  );
  assert.match(
    await reasonOf(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }),
    /models\.dev did not answer: getaddrinfo ENOTFOUND/,
  );
});
