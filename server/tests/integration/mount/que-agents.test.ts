/**
 * que's own agent configs, in `server/agents/`. Each one mounts, and names
 * no package, so any deployment can list it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mountAgents } from "../../../harness/src/mount/agents.js";
import { mountDeployment } from "../../../harness/src/mount/deployment.js";

const agents = join(import.meta.dirname, "../../../agents");

test("que's chat agent mounts, and names no package", async () => {
  const [chat] = await mountAgents([join(agents, "chat.ts")]);
  assert.equal(chat.name, "chat");
  assert.equal(chat.packages, undefined);
});

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

test("que's chat agent stops the mount when its loop is not listed", async () => {
  await assert.rejects(
    mountDeployment(deployment("que-chat-no-loop")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /"chat"/);
      assert.match(error.message, /"long-chat"/);
      return true;
    },
  );
});
