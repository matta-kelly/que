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
  const mounted = await mountDeployment(deployment("que-own"));
  assert.deepEqual(
    mounted.agents.map((agent) => [agent.name, agent.loop]),
    [
      ["chat", "long-chat"],
      ["deep-chat", "deep"],
    ],
  );
  const [chat, deepChat] = mounted.agents;
  assert.deepEqual(
    { ...deepChat, name: chat.name, loop: chat.loop },
    chat,
    "deep-chat is the chat agent, but for its name and its loop",
  );
});
