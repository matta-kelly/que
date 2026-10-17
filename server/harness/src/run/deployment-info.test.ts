import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentInfo } from "./deployment-info.js";

const big = {
  name: "big",
  id: "fireworks:big-model",
  window: 1_000_000,
  maxTokens: 100_000,
  price: { input: 1, output: 2 },
};
const small = {
  name: "small",
  id: "fireworks:small-model",
  window: 64_000,
  maxTokens: 8_000,
  price: { input: 0.5, output: 1, cachedInput: 0.1 },
};
const longChat = { name: "long-chat" };
const chat = { name: "chat", packages: [], model: "big", loop: "long-chat" };
const lean = {
  name: "lean",
  packages: [],
  model: "small",
  loop: "long-chat",
  instructions: "Be brief.",
};

test("an agent has the model it names", () => {
  const { agents } = deploymentInfo([chat, lean], [big, small], [longChat]);
  assert.deepEqual(
    agents.map(({ name, model }) => ({ name, model })),
    [
      { name: "chat", model: "big" },
      { name: "lean", model: "small" },
    ],
  );
});

test("a model has its name, window, maxTokens and price, and no provider id", () => {
  assert.deepEqual(deploymentInfo([chat], [big, small], [longChat]).models, [
    {
      name: "big",
      window: 1_000_000,
      maxTokens: 100_000,
      price: { input: 1, output: 2 },
    },
    {
      name: "small",
      window: 64_000,
      maxTokens: 8_000,
      price: { input: 0.5, output: 1, cachedInput: 0.1 },
    },
  ]);
});

test("an agent has the share its loop summarizes at, and none when it does not summarize", () => {
  const loops = [
    longChat,
    { name: "early", summarize: { at: 0.5, keep: 0.1 } },
    { name: "whole", summarize: false as const },
  ];
  const on = (loop: string) => ({
    name: loop,
    packages: [],
    model: "big",
    loop,
  });
  const { agents } = deploymentInfo(
    [on("long-chat"), on("early"), on("whole")],
    [big],
    loops,
  );
  assert.deepEqual(agents, [
    // que's own share, when the loop leaves it out.
    { name: "long-chat", model: "big", summarizeAt: 0.85 },
    { name: "early", model: "big", summarizeAt: 0.5 },
    { name: "whole", model: "big" },
  ]);
});
