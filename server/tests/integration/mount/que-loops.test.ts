/**
 * que's own loop configs, in `server/loops/`. Each one mounts, so any
 * deployment can list it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { LOOP_DEFAULTS } from "@que/core";
import { mountLoops } from "../../../harness/src/mount/loops.js";

const loops = join(import.meta.dirname, "../../../loops");

test("que's long-chat loop and short-run loop mount", async () => {
  const mounted = await mountLoops([
    join(loops, "long-chat.ts"),
    join(loops, "short-run.ts"),
  ]);
  assert.deepEqual(
    mounted.map((loop) => loop.name),
    ["long-chat", "short-run"],
  );
});

test("que's long-chat loop writes out que's own value for each setting", async () => {
  const [longChat] = await mountLoops([join(loops, "long-chat.ts")]);
  assert.deepEqual(longChat, { name: "long-chat", ...LOOP_DEFAULTS });
});
