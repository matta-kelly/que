import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import type { Case } from "./case.ts";
import {
  definePlugin,
  type AccessRole,
  type Capability,
  type Op,
} from "./contract.ts";
import { pluginFiles } from "./layout.ts";
import { checkPlugins, piecesOf } from "./lint.ts";
import type { Skill } from "./skill.ts";

const find = (plugin: string, role?: string): Op => ({
  name: `${plugin}-find`,
  type: "op",
  title: "Find",
  description: "Finds a thing.",
  ...(role && { role }),
  input: z.object({}),
  run: async () => ({}),
});

const guide = (plugin: string): Skill => ({
  name: `${plugin}-guide`,
  type: "skill",
  title: "Guide",
  description: "How to find.",
  body: "Find it.",
});

const role = (name: string): AccessRole => ({
  name,
  type: "access-role",
  description: "A login.",
});

// The pieces of a plugin with one op, `<name>-find`, and one skill, `<name>-guide`, at its folder, `<name>`.
const pieces = (
  name: string,
  fields: {
    usesOps?: string[];
    usesSkills?: string[];
    roles?: AccessRole[];
    ops?: Op[];
    capabilities?: Capability[];
    cases?: Case[];
  } = {},
) => {
  const { cases = [], ...held } = fields;
  return piecesOf({
    dir: name,
    files: pluginFiles(name),
    definition: definePlugin({
      name,
      type: "plugin",
      title: name,
      description: "A plugin.",
      ops: [find(name)],
      ...held,
    }),
    cases,
    skills: [guide(name)],
    skillNames: [`${name}-guide`],
    problems: [],
  });
};

const said = (problems: ReturnType<typeof checkPlugins>) =>
  problems.map(({ path, rule, field, message }) => [
    path,
    rule,
    field,
    message,
  ]);

const definitionOf = (name: string) =>
  `${name}/io.github.matta-kelly.que/index.ts`;

test("piecesOf gives each node as code gives it, and the plugin's skills as its folders", () => {
  const given = piecesOf({
    dir: "odoo",
    files: pluginFiles("odoo"),
    definition: definePlugin({
      name: "odoo",
      type: "plugin",
      title: "Odoo",
      description: "A plugin.",
      ops: [find("odoo")],
    }),
    cases: [],
    skills: [],
    skillNames: ["odoo-guide"],
    problems: [],
  });
  assert.deepEqual(
    given.map(({ path, name }) => [path, name]),
    [
      [definitionOf("odoo"), "odoo"],
      [`${definitionOf("odoo")}#ops/odoo-find`, "odoo-find"],
    ],
  );
  assert.deepEqual(given[0].fields.skills, ["odoo-guide"]);
  assert.equal(typeof given[1].fields.run, "function");
});

test("checkPlugins finds a name a plugin's ops use that is a skill", () => {
  assert.deepEqual(
    said(
      checkPlugins([
        ...pieces("odoo"),
        ...pieces("pim", { usesOps: ["odoo-guide"] }),
      ]),
    ).map(([path, rule, field]) => [path, rule, field]),
    [[definitionOf("pim"), "basis/link", "/usesOps"]],
  );
});

test("checkPlugins finds a plugin that uses an op of a plugin that uses others, naming both", () => {
  const problems = checkPlugins([
    ...pieces("odoo"),
    ...pieces("pim", { usesOps: ["odoo-find"] }),
    ...pieces("sales", { usesOps: ["pim-find"] }),
  ]);
  assert.deepEqual(
    said(problems).map(([path, rule, field]) => [path, rule, field]),
    [[definitionOf("sales"), "plugin/connector-use", "/usesOps"]],
  );
  assert.match(
    problems[0]?.message ?? "",
    /^pim-find is pim's, and pim uses other plugins' ops and skills/,
  );
});

test("checkPlugins finds a plugin that uses its own skill", () => {
  assert.deepEqual(
    said(checkPlugins(pieces("notes", { usesSkills: ["notes-guide"] }))),
    [
      [
        definitionOf("notes"),
        "plugin/own-use",
        "/usesSkills",
        "notes-guide is its own: a plugin uses only other plugins' ops and skills.",
      ],
    ],
  );
});

test("checkPlugins takes a plugin whose ops each name one of its roles", () => {
  assert.deepEqual(
    checkPlugins(
      pieces("notes", {
        roles: [role("notes-read")],
        ops: [find("notes", "notes-read")],
      }),
    ),
    [],
  );
});

test("checkPlugins finds an op with no role when its plugin lists roles", () => {
  assert.deepEqual(
    said(checkPlugins(pieces("notes", { roles: [role("notes-read")] }))),
    [
      [
        definitionOf("notes"),
        "plugin/op-role",
        "/ops/0",
        "notes-find names no role: the plugin lists roles (notes-read), so each op names one.",
      ],
    ],
  );
});

test("checkPlugins finds an op that names another plugin's role", () => {
  assert.deepEqual(
    said(
      checkPlugins([
        ...pieces("odoo", { roles: [role("odoo-admin")] }),
        ...pieces("notes", { ops: [find("notes", "odoo-admin")] }),
      ]),
    ).filter(([path]) => path === definitionOf("notes")),
    [
      [
        definitionOf("notes"),
        "plugin/op-role",
        "/ops/0",
        "notes-find names the role odoo-admin, which is not its plugin's: the plugin lists none.",
      ],
    ],
  );
});

test("checkPlugins finds an op whose role is no node once, by basis/link", () => {
  assert.deepEqual(
    said(
      checkPlugins(pieces("notes", { ops: [find("notes", "notes-admin")] })),
    ),
    [
      [
        `${definitionOf("notes")}#ops/notes-find`,
        "basis/link",
        "/role",
        "It points at notes-admin, which is not a node.",
      ],
    ],
  );
});

const capabilityOf = (name: string): Capability => ({
  name,
  type: "capability",
  title: name,
  description: "An outcome.",
});

const caseOf = (capability: string): Case => ({
  name: `${capability}-asked`,
  type: "case",
  description: "A behaviour of its capability.",
  capability,
  input: "Do it.",
  start: "Any.",
  good: "It is done.",
});

test("checkPlugins takes a plugin whose cases are each about a capability it lists", () => {
  assert.deepEqual(
    checkPlugins(
      pieces("odoo", {
        capabilities: [capabilityOf("find-company")],
        cases: [caseOf("find-company")],
      }),
    ),
    [],
  );
});

test("checkPlugins finds a case about another plugin's capability, in the deployment's graph", () => {
  assert.deepEqual(
    said(
      checkPlugins([
        ...pieces("warehouse", { capabilities: [capabilityOf("find-fabric")] }),
        ...pieces("odoo", { cases: [caseOf("find-fabric")] }),
      ]),
    ),
    [
      [
        definitionOf("odoo"),
        "plugin/case-capability",
        "/cases/0",
        "find-fabric-asked is about find-fabric, which odoo does not list: a case is about a capability of the plugin that holds it.",
      ],
    ],
  );
});
