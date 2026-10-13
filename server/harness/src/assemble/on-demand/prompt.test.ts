import { test } from "node:test";
import assert from "node:assert/strict";
import { assemble } from "../assemble.js";
import type { Catalog } from "../../access/catalog.js";
import {
  besideNothing,
  catalog,
  identityOnly,
  skillsOnly,
} from "../fixture.js";
import { onDemand } from "./index.js";

const systemPrompt = (the: {
  user?: { name: string; email: string };
  catalog: Catalog;
}) =>
  assemble(onDemand, { ...the, connect: async () => undefined }).systemPrompt;

const prompt = systemPrompt({
  user: { name: "Ann User", email: "ann@example.test" },
  catalog,
});

test("mentions read_skill only when a package has a skill", () => {
  assert.match(prompt, /read_skill/);
  const noSkills = [{ ...catalog[0], pkg: { ...catalog[0].pkg, skills: [] } }];
  assert.doesNotMatch(systemPrompt({ catalog: noSkills }), /read_skill/);
});

test("for packages with skills and no operations, says how to open a package and read a skill", () => {
  assert.equal(
    systemPrompt({ catalog: skillsOnly }),
    [
      "You are a helpful assistant.",
      "",
      "- Be concise and accurate.",
      "- If you're unsure about something, say so rather than guessing.",
      "",
      "## Your environment",
      "",
      "Everything you can do for the user comes from packages. A package is one service the user has connected. It holds:",
      "",
      "- skills: written guides for tasks in that service",
      "",
      "Pick a package from the list below and call `open_package` to see what it holds.",
      "",
      "Before a task a skill covers, read it with `read_skill`.",
      "",
      "If no package covers a request, say so.",
      "",
      "## Packages",
      "",
      "### Shop (`shop`)",
      "The shop's order system.",
    ].join("\n"),
  );
});

test("for packages that hold nothing, says there is nothing to open or run", () => {
  assert.equal(
    systemPrompt({ catalog: identityOnly }),
    [
      "You are a helpful assistant.",
      "",
      "- Be concise and accurate.",
      "- If you're unsure about something, say so rather than guessing.",
      "",
      "## Your environment",
      "",
      "The user's packages are listed below. They hold nothing to open or run: what each one says about itself is all there is.",
      "",
      "## Packages",
      "",
      "### Notes (`notes`)",
      "How the team writes things down.",
    ].join("\n"),
  );
});

test("the prompt still says how to reach an operation and read a skill when a package that holds nothing comes first", () => {
  assert.equal(
    systemPrompt({ catalog: besideNothing }),
    [
      "You are a helpful assistant.",
      "",
      "- Be concise and accurate.",
      "- If you're unsure about something, say so rather than guessing.",
      "",
      "## Your environment",
      "",
      "Everything you can do for the user comes from packages. A package is one service the user has connected. It holds:",
      "",
      "- operations: actions you can run in that service, each with a description and arguments",
      "- skills: written guides for tasks in that service",
      "",
      "You start with no operations in reach. To use one:",
      "",
      "1. Pick a package from the list below.",
      "2. Call `open_package` to see what it holds.",
      "3. Call `load_operation` for each operation you need. It becomes a tool named `<package>_<operation>` and stays for the rest of the conversation.",
      "4. Call that tool.",
      "",
      "Before a task a skill covers, read it with `read_skill`.",
      "",
      "If no package covers a request, say so.",
      "",
      "## Packages",
      "",
      "### Notes (`notes`)",
      "How the team writes things down.",
      "",
      "### Shop (`shop`)",
      "The shop's order system.",
    ].join("\n"),
  );
});
