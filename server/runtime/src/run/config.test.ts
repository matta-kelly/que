import { test } from "node:test";
import assert from "node:assert/strict";
import { configFor } from "./config.js";

const chat = {
  name: "chat",
  type: "agent" as const,
  description: "An agent of a test.",
  plugins: ["odoo"],
  model: "big",
  loop: "long-chat",
  instructions: "You help the sales team.",
};
const lean = {
  name: "lean",
  type: "agent" as const,
  description: "An agent of a test.",
  plugins: [],
  model: "small",
  loop: "short-run",
};

test("a run that names no agent gets the first one the deployment lists", () => {
  assert.equal(configFor([chat, lean], undefined), chat);
});

test("a run that names an agent gets that one", () => {
  assert.equal(configFor([chat, lean], "lean"), lean);
});

test("a run that names an agent the deployment does not have fails, and the error lists the ones it has", () => {
  assert.throws(
    () => configFor([chat, lean], "bold"),
    /no agent "bold"\. Agents: chat, lean/,
  );
});
