import { test } from "node:test";
import assert from "node:assert/strict";
import { configFor, OWN_CHOICES } from "./config.js";

const chat = { name: "chat", instructions: "You help the sales team." };
const lean = { name: "lean", model: "provider:small-model" };

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

test("on a deployment with no agents, a run that names none gets que's own choices", () => {
  assert.equal(configFor([], undefined), OWN_CHOICES);
  assert.deepEqual(OWN_CHOICES, { name: "default" });
});
