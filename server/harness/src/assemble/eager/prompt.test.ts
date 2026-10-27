import { test } from "node:test";
import assert from "node:assert/strict";
import { assemble } from "../assemble.js";
import type { Catalog } from "../../access/catalog.js";
import { catalog, identityOnly, mixed, skillsOnly } from "../fixture.js";
import { eager } from "./index.js";

const systemPrompt = (catalog: Catalog) =>
  assemble(eager, { catalog, connect: async () => undefined }).systemPrompt;

const HEAD = [
  "You are a helpful assistant.",
  "",
  "- Be concise and accurate.",
  "- If you're unsure about something, say so rather than guessing.",
  "",
  "## Your environment",
  "",
];

test("says every operation is already a tool, and lists the skills by id", () => {
  assert.equal(
    systemPrompt(catalog),
    [
      ...HEAD,
      "Everything you can do for the user comes from plugins. A plugin is one service the user has connected. It holds:",
      "",
      "- operations: actions you can run in that service, each with a description and arguments",
      "- skills: written guides for tasks in that service",
      "",
      "Every operation is already a tool, named `<plugin>-<operation>`. Call it.",
      "",
      "Before a task a skill covers, read it with `read_skill`, by its id. The skills:",
      "",
      "- shop-refunds: Refunds. How to refund an order.",
      "",
      "If no plugin covers a request, say so.",
      "",
      "## Plugins",
      "",
      "### Shop (`shop`)",
      "The shop's order system.",
      'You\'re connected as User Seven (Shop user 7); "me"/"mine" in Shop means this user.',
    ].join("\n"),
  );
});

test("for plugins with skills and no operations, names no operation", () => {
  const prompt = systemPrompt(skillsOnly);
  assert.doesNotMatch(prompt, /operation/);
  assert.match(prompt, /- shop-refunds: Refunds\. How to refund an order\./);
});

test("lists the skills of every plugin", () => {
  const prompt = systemPrompt(mixed);
  assert.match(prompt, /- shop-refunds: Refunds\./);
  assert.match(
    prompt,
    /- notes-meetings: Meetings\. How to write up a meeting\./,
  );
});

test("mentions read_skill only when a plugin has a skill", () => {
  const noSkills = [
    { ...catalog[0], plugin: { ...catalog[0].plugin, skills: [] } },
  ];
  assert.doesNotMatch(systemPrompt(noSkills), /read_skill/);
});

test("for plugins that hold nothing, says there is nothing to run or read", () => {
  assert.equal(
    systemPrompt(identityOnly),
    [
      ...HEAD,
      "The user's plugins are listed below. They hold nothing to run or read: what each one says about itself is all there is.",
      "",
      "## Plugins",
      "",
      "### Notes (`notes`)",
      "How the team writes things down.",
    ].join("\n"),
  );
});
