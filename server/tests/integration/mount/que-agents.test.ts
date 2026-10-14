/**
 * que's own agent configs, in `server/agents/`. Each one mounts, and names
 * no package, so any deployment can list it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mountDeployment } from "../../../harness/src/mount/deployment.js";

const deployment = (name: string) =>
  join(import.meta.dirname, "fixtures/deployments", name);

test("que's agents and the loops they name mount as one deployment", async () => {
  // que's own model files write no fact, so mount is handed sources that call no network.
  const mounted = await mountDeployment(
    deployment("que-own"),
    {},
    {
      window: async () => ({ window: 512_000 }),
      price: async () => ({ price: { input: 0.3, output: 1.2 } }),
      done: async () => {},
    },
  );
  assert.deepEqual(
    mounted.agents.map((agent) => [agent.name, agent.loop]),
    [["chat", "long-chat"]],
  );
});
