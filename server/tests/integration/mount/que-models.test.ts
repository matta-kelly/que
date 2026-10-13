/**
 * que's own model configs, in `server/models/`. Each one mounts, so any
 * deployment can list it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mountModels } from "../../../harness/src/mount/models.js";
import { OWN_MODEL } from "../../../harness/src/run/model.js";

const models = join(import.meta.dirname, "../../../models");

test("que's three models mount, with the id, window and maxTokens of each", async () => {
  const mounted = await mountModels(
    ["glm-flash.ts", "deepseek-flash.ts", "minimax-m3.ts"].map((file) =>
      join(models, file),
    ),
  );
  assert.deepEqual(mounted, [
    {
      name: "glm-flash",
      id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
      window: 1_040_000,
      maxTokens: 131_072,
    },
    {
      name: "deepseek-flash",
      id: "fireworks:accounts/fireworks/models/deepseek-v4p1-flash",
      window: 1_048_576,
      maxTokens: 131_072,
    },
    {
      name: "minimax-m3",
      id: "fireworks:accounts/fireworks/models/minimax-m3",
      window: 512_000,
      maxTokens: 64_000,
    },
  ]);
  assert.deepEqual(OWN_MODEL, mounted[0], "que's own model is glm-flash");
});
