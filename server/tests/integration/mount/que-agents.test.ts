/**
 * que's own agent configs, in `agents/` at the root of the repo. Each one
 * mounts, and names no package, so any deployment can list it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mountAgents } from "../../../harness/src/mount/agents.js";

const agents = join(import.meta.dirname, "../../../../agents");

test("que's chat agent mounts, and names no package", async () => {
  const [chat] = await mountAgents([join(agents, "chat.ts")]);
  assert.equal(chat.name, "chat");
  assert.equal(chat.packages, undefined);
});
