import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { savedFacts } from "./saved.js";

const folder = () => mkdtempSync(join(tmpdir(), "que-saved-"));

test("savedFacts reads back what it wrote, and reads a missing or broken file as empty", async () => {
  const dir = folder();
  assert.deepEqual(await savedFacts(dir).read(), {}, "no file");

  const facts = {
    "fireworks:one": { window: 100, price: { input: 1, output: 2 } },
    "fireworks:two": { window: 200 },
  };
  await savedFacts(dir).write(facts);
  assert.deepEqual(await savedFacts(dir).read(), facts);
  // One file, in `.que`, and no file left beside it from the write.
  assert.deepEqual(readdirSync(join(dir, ".que")), ["model-facts.json"]);

  const broken = folder();
  mkdirSync(join(broken, ".que"));
  writeFileSync(join(broken, ".que/model-facts.json"), '{"fireworks:one": ');
  assert.deepEqual(await savedFacts(broken).read(), {});
  writeFileSync(join(broken, ".que/model-facts.json"), "[1, 2]");
  assert.deepEqual(await savedFacts(broken).read(), {});
});
