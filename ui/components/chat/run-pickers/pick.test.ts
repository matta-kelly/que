import { test } from "vitest";
import assert from "node:assert/strict";
import { agentPick, resolve } from "./pick.ts";

const deployment = {
  agents: [
    { name: "chat", model: "big" },
    { name: "lean", model: "small" },
  ],
  models: [
    { name: "big", window: 1_000_000, maxTokens: 100_000 },
    { name: "small", window: 64_000, maxTokens: 8_000 },
  ],
};

test("resolve shows the first agent and its model for a thread with no pick", () => {
  assert.deepEqual(resolve({}, deployment), {
    agent: "chat",
    model: "big",
  });
});

test("resolve shows a pick the deployment lists", () => {
  assert.deepEqual(resolve({ agent: "lean", model: "big" }, deployment), {
    agent: "lean",
    model: "big",
  });
});

test("resolve drops a name the deployment does not list", () => {
  assert.deepEqual(resolve({ agent: "gone", model: "huge" }, deployment), {
    agent: "chat",
    model: "big",
  });
  assert.deepEqual(resolve({ agent: "lean", model: "huge" }, deployment), {
    agent: "lean",
    model: "small",
  });
});

test("resolve shows the pick as it is while the deployment is not known", () => {
  assert.deepEqual(resolve({ model: "small" }, undefined), {
    agent: undefined,
    model: "small",
  });
});

test("resolve shows nothing on a deployment that lists no agents and no models", () => {
  assert.deepEqual(resolve({}, { agents: [], models: [] }), {
    agent: undefined,
    model: undefined,
  });
});

test("agentPick clears the picked model, so the chat shows the model of the agent", () => {
  const pick = { agent: "chat", model: "big", ...agentPick("lean") };
  assert.deepEqual(resolve(pick, deployment), {
    agent: "lean",
    model: "small",
  });
});
