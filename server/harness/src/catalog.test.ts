import { test } from "node:test";
import assert from "node:assert/strict";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { factsOf } from "./catalog.ts";

test("factsOf gives the window, the price and the input modalities pi's model catalog has for a model, by its provider and its name there", () => {
  for (const [name, input] of [
    ["accounts/fireworks/models/glm-5p3-flash", ["text", "image"]],
    ["accounts/fireworks/models/minimax-m3", ["text"]],
    ["accounts/fireworks/models/deepseek-v4p1-flash", ["text", "image"]],
  ] as const) {
    const entry = getBuiltinModel("fireworks", name as never);
    assert.ok(entry, `pi's catalog has no fireworks ${name}`);
    assert.deepEqual(factsOf(`fireworks:${name}`), {
      window: entry.contextWindow,
      price: {
        input: entry.cost.input,
        output: entry.cost.output,
        cachedInput: entry.cost.cacheRead,
      },
      input: [...input],
    });
  }
});

test("factsOf gives none for a model the catalog has no entry for: a provider it has not, a name it has not, or a name of no model", () => {
  for (const id of [
    "beam:Beam-1.0-501B-A23B",
    "fireworks:accounts/fireworks/models/bare-model",
    "fireworks:constructor",
    "constructor:constructor",
  ])
    assert.equal(factsOf(id), undefined, id);
});
