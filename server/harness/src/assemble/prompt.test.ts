import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog } from "./fixture.js";
import { systemPrompt } from "./prompt.js";

const user = { name: "Ann User", email: "ann@example.test" };
const environment = () => "## Your environment\n\nEvery operation is a tool.";

const REST = [
  "## You",
  "",
  "You're assisting Ann User (ann@example.test).",
  "",
  "## Your environment",
  "",
  "Every operation is a tool.",
  "",
  "## Packages",
  "",
  "### Shop (`shop`)",
  "The shop's order system.",
  'You\'re connected as User Seven (Shop user 7); "me"/"mine" in Shop means this user.',
].join("\n");

const instructed = systemPrompt({
  user,
  catalog,
  environment,
  instructions: "You help the sales team.",
});

test("given instructions, the rest of the prompt is the same", () => {
  assert.equal(instructed, ["You help the sales team.", "", REST].join("\n"));
});

test("given instructions and no packages, the prompt opens with them and says there are no packages", () => {
  assert.equal(
    systemPrompt({
      catalog: [],
      environment,
      instructions: "You help the sales team.",
    }),
    [
      "You help the sales team.",
      "",
      "## Your environment",
      "",
      "The user has no packages connected, so there is nothing you can look up or do for them yet.",
    ].join("\n"),
  );
});
