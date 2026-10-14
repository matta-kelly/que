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

test("resolve sends nothing for a thread with no pick, and shows the first agent and its model", () => {
  assert.deepEqual(resolve({}, deployment), {
    agent: "chat",
    model: "big",
    send: {},
  });
});

test("resolve sends a pick the deployment lists", () => {
  assert.deepEqual(resolve({ agent: "lean", model: "big" }, deployment), {
    agent: "lean",
    model: "big",
    send: { agent: "lean", model: "big" },
  });
});

test("resolve drops a name the deployment does not list", () => {
  assert.deepEqual(resolve({ agent: "gone", model: "huge" }, deployment), {
    agent: "chat",
    model: "big",
    send: {},
  });
  assert.deepEqual(resolve({ agent: "lean", model: "huge" }, deployment), {
    agent: "lean",
    model: "small",
    send: { agent: "lean" },
  });
});

test("resolve sends the pick as it is while the deployment is not known", () => {
  assert.deepEqual(resolve({ model: "small" }, undefined), {
    agent: undefined,
    model: "small",
    send: { model: "small" },
  });
});

test("resolve shows nothing on a deployment that lists no agents and no models", () => {
  assert.deepEqual(resolve({}, { agents: [], models: [] }), {
    agent: undefined,
    model: undefined,
    send: {},
  });
});

test("agentPick clears the picked model, so the chat shows and sends the model of the agent", () => {
  const pick = { agent: "chat", model: "big", ...agentPick("lean") };
  assert.deepEqual(resolve(pick, deployment), {
    agent: "lean",
    model: "small",
    send: { agent: "lean" },
  });
});
