import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { factSources } from "./index.js";

const record = readFileSync(
  join(import.meta.dirname, "fixtures/fireworks-model.json"),
  "utf8",
);
const database = readFileSync(
  join(import.meta.dirname, "fixtures/models-dev.json"),
  "utf8",
);

const folder = () => mkdtempSync(join(tmpdir(), "que-facts-"));
const saved = (dir: string) => join(dir, ".que/model-facts.json");
const ENV = { FIREWORKS_API_KEY: "a-key" };

const glm = {
  name: "glm-flash",
  type: "model" as const,
  description: "A model of a test.",
  id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
  maxTokens: 100,
};
const PRICE = { input: 0.15, output: 0.5, cachedInput: 0.03 };

/** The two sources, up or down, with a count of the calls made. */
function network(up: boolean) {
  const calls: string[] = [];
  const fetch: typeof globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (!up) throw new Error("network is down");
    return new Response(String(url).includes("models.dev") ? database : record);
  };
  return { fetch, calls };
}

test("factSources saves what a source gives, and reads the saved copy when a source gives none", async () => {
  const dir = folder();
  const first = factSources(dir, ENV, network(true).fetch);
  assert.deepEqual(await first.window(glm), { window: 1_048_576 });
  assert.deepEqual(await first.price(glm), { price: PRICE });
  await first.done();
  assert.deepEqual(JSON.parse(readFileSync(saved(dir), "utf8")), {
    [glm.id]: { window: 1_048_576, price: PRICE },
  });

  // The next start has no network: each fact is the saved one.
  const second = factSources(dir, ENV, network(false).fetch);
  assert.deepEqual(await second.window(glm), { window: 1_048_576 });
  assert.deepEqual(await second.price(glm), { price: PRICE });

  // With no network and no saved copy, the source's own reason comes back.
  const none = factSources(folder(), ENV, network(false).fetch);
  const window = await none.window(glm);
  assert.ok("reason" in window);
  assert.match(window.reason, /Fireworks did not answer: network is down/);
  const price = await none.price(glm);
  assert.ok("reason" in price);
  assert.match(price.reason, /models\.dev did not answer: network is down/);
});

test("factSources writes the file one time, whole", async () => {
  const dir = folder();
  const sources = factSources(dir, ENV, network(true).fetch);
  await sources.window(glm);
  assert.equal(existsSync(saved(dir)), false, "nothing is written before done");
  await sources.done();
  assert.equal(existsSync(saved(dir)), true);

  // A mount that got nothing new from a source writes no file.
  const idle = folder();
  await factSources(idle, ENV, network(true).fetch).done();
  assert.equal(existsSync(saved(idle)), false);
  const down = folder();
  const offline = factSources(down, ENV, network(false).fetch);
  await offline.window(glm);
  await offline.done();
  assert.equal(existsSync(saved(down)), false);

  // What was saved for a model this mount did not ask for is kept.
  const other = {
    ...glm,
    name: "other",
    id: "fireworks:accounts/fireworks/models/minimax-m3",
  };
  const again = factSources(dir, ENV, network(true).fetch);
  await again.price(other);
  await again.done();
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(saved(dir), "utf8"))), [
    glm.id,
    other.id,
  ]);
});

test("factSources asks a source one time for two models of one id", async () => {
  const { fetch, calls } = network(true);
  const sources = factSources(folder(), ENV, fetch);
  const twin = { ...glm, name: "glm-again" };
  await Promise.all([
    sources.window(glm),
    sources.window(twin),
    sources.price(glm),
    sources.price(twin),
  ]);
  assert.equal(calls.length, 2, calls.join(", "));
});

test("factSources does not stop when the saved copy cannot be written", async (t) => {
  // `.que` is a file here, so no folder of that name can be made.
  const dir = folder();
  writeFileSync(join(dir, ".que"), "in the way");
  const warned = t.mock.method(console, "warn", () => {});
  const sources = factSources(dir, ENV, network(true).fetch);
  assert.deepEqual(await sources.window(glm), { window: 1_048_576 });
  await sources.done();
  assert.equal(warned.mock.callCount(), 1);
  assert.match(
    String(warned.mock.calls[0].arguments[0]),
    /mount: the saved copy of the models' facts was not written/,
  );
});
