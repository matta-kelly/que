import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beamWindow } from "./beam.js";
import { factSources } from "./index.js";

// The provider's own answer for one model, saved.
const record = readFileSync(
  join(import.meta.dirname, "fixtures/beam-model.json"),
  "utf8",
);
const database = readFileSync(
  join(import.meta.dirname, "fixtures/models-dev.json"),
  "utf8",
);
const MODEL = "Beam-1.0-501B-A23B";

/** A `fetch` that answers one way, and keeps what it was asked. */
function answering(answer: (url: string) => Response | Promise<Response>) {
  const asked: { url: string; auth: string | null }[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    asked.push({
      url: String(url),
      auth: new Headers(init?.headers).get("authorization"),
    });
    return answer(String(url));
  };
  return { fetch, asked };
}

test("beamWindow reads context_length of the model record", async () => {
  const { fetch, asked } = answering(() => new Response(record));
  assert.deepEqual(await beamWindow(MODEL, "a-key", fetch), {
    window: 1_048_576,
  });
  assert.deepEqual(asked, [
    {
      url: `https://api.reflection.ai/openai/v1/models/${MODEL}`,
      auth: "Bearer a-key",
    },
  ]);
});

test("beamWindow gives a reason for an error status, a record with no window, and no answer", async () => {
  const reasonOf = async (fetch: typeof globalThis.fetch, key = "a-key") => {
    const got = await beamWindow(MODEL, key, fetch);
    assert.ok("reason" in got, JSON.stringify(got));
    return got.reason;
  };
  assert.match(
    await reasonOf(answering(() => new Response("no", { status: 401 })).fetch),
    /Beam answered 401/,
  );
  assert.match(
    await reasonOf(answering(() => new Response('{"id":"x"}')).fetch),
    /no context_length/,
  );
  assert.match(
    await reasonOf(
      answering(() => new Response('{"context_length":1.5}')).fetch,
    ),
    /no context_length/,
  );
  assert.match(
    await reasonOf(async () => {
      throw new Error("connect ETIMEDOUT");
    }),
    /Beam did not answer: connect ETIMEDOUT/,
  );
  // With no key the provider is not asked.
  const unasked = answering(() => new Response(record));
  assert.match(await reasonOf(unasked.fetch, ""), /BEAM_API_KEY is not set/);
  assert.deepEqual(unasked.asked, []);
});

test("a beam model gets its window from Reflection with BEAM_API_KEY, and its price from models.dev's reflection", async () => {
  const { fetch, asked } = answering(
    (url) => new Response(url.includes("models.dev") ? database : record),
  );
  const sources = factSources(
    mkdtempSync(join(tmpdir(), "que-facts-")),
    { BEAM_API_KEY: "a-key" },
    fetch,
  );
  const beam = {
    name: "beam",
    type: "model" as const,
    description: "A model of a test.",
    id: `beam:${MODEL}`,
    maxTokens: 131_072,
  };
  assert.deepEqual(await sources.window(beam), { window: 1_048_576 });
  assert.deepEqual(await sources.price(beam), {
    price: { input: 0, output: 0, cachedInput: 0 },
  });
  assert.deepEqual(asked, [
    {
      url: `https://api.reflection.ai/openai/v1/models/${MODEL}`,
      auth: "Bearer a-key",
    },
    { url: "https://models.dev/api.json", auth: null },
  ]);
});
