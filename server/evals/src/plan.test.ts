import { test } from "node:test";
import assert from "node:assert/strict";
import { plan } from "./plan.js";

const byCustomer = {
  package: "shop",
  name: "find-order-by-customer",
  capability: "find-order",
  input: "Where is the order of Ada?",
  start: "Ada has one open order.",
  good: "The answer gives the state of the order of Ada.",
};
const notAsked = {
  package: "shop",
  name: "find-order-not-asked",
  capability: "find-order",
  input: "What can you do?",
  start: "Any.",
  good: "No operation is called.",
};
const chat = { name: "chat" };
const lean = { name: "lean" };
const notesOnly = { name: "notes-only", packages: ["notes"] };

test("plans each case under each agent, grouped by case, in the order the deployment lists them", () => {
  assert.deepEqual(plan([byCustomer, notAsked], [chat, lean], []), [
    { case: byCustomer, agent: "chat" },
    { case: byCustomer, agent: "lean" },
    { case: notAsked, agent: "chat" },
    { case: notAsked, agent: "lean" },
  ]);
});

test("with agents named, plans only those, in the order named", () => {
  assert.deepEqual(
    plan([byCustomer], [chat, lean, notesOnly], ["lean", "chat"]),
    [
      { case: byCustomer, agent: "lean" },
      { case: byCustomer, agent: "chat" },
    ],
  );
});

test("stops on a named agent the deployment does not list, and lists the ones there are", () => {
  assert.throws(
    () => plan([byCustomer], [chat, lean], ["bold"]),
    (error: Error) => {
      assert.equal(error.message, 'eval: no agent "bold". Agents: chat, lean');
      return true;
    },
  );
});

test("with no agents listed, plans one run for each case, with no agent named", () => {
  assert.deepEqual(plan([byCustomer, notAsked], [], []), [
    { case: byCustomer },
    { case: notAsked },
  ]);
});
