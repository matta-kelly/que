/**
 * que's own model configs, in `server/models/`. Each one mounts, so any
 * deployment can list it. They write no fact: the window and the price of
 * each come from the sources, which here are the answers of the provider and
 * of the model database, written out.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import type { ModelPrice } from "@que/core";
import { mountModels } from "../../../harness/src/mount/models.js";
import { OWN_MODEL } from "../../../harness/src/run/model.js";

const models = join(import.meta.dirname, "../../../models");

const FACTS: Record<string, { window: number; price: ModelPrice }> = {
  "fireworks:accounts/fireworks/models/glm-5p3-flash": {
    window: 1_048_576,
    price: { input: 0.15, output: 0.5, cachedInput: 0.03 },
  },
  "fireworks:accounts/fireworks/models/deepseek-v4p1-flash": {
    window: 1_048_576,
    price: { input: 0.3, output: 1.2, cachedInput: 0.006 },
  },
  "fireworks:accounts/fireworks/models/minimax-m3": {
    window: 512_000,
    price: { input: 0.3, output: 1.2, cachedInput: 0.06 },
  },
};

test("que's own model files mount with facts from the sources, and write none", async () => {
  const mounted = await mountModels(
    ["glm-flash.ts", "deepseek-flash.ts", "minimax-m3.ts"].map((file) =>
      join(models, file),
    ),
    {
      window: async (model) => ({ window: FACTS[model.id].window }),
      price: async (model) => ({ price: FACTS[model.id].price }),
      done: async () => {},
    },
  );
  assert.deepEqual(mounted, [
    {
      name: "glm-flash",
      id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
      maxTokens: 131_072,
      ...FACTS["fireworks:accounts/fireworks/models/glm-5p3-flash"],
    },
    {
      name: "deepseek-flash",
      id: "fireworks:accounts/fireworks/models/deepseek-v4p1-flash",
      maxTokens: 131_072,
      ...FACTS["fireworks:accounts/fireworks/models/deepseek-v4p1-flash"],
    },
    {
      name: "minimax-m3",
      id: "fireworks:accounts/fireworks/models/minimax-m3",
      maxTokens: 64_000,
      ...FACTS["fireworks:accounts/fireworks/models/minimax-m3"],
    },
  ]);
  assert.deepEqual(OWN_MODEL, mounted[0], "que's own model is glm-flash");
});
