import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { definePlugin, type Skill } from "@que/core";
import type { MountedPlugin } from "./plugins.js";
import { sharedNames, unresolvedUses } from "./uses.js";

const find = {
  name: "find-fabric",
  title: "Find a fabric",
  description: "Find a fabric by its code.",
  schema: z.object({ code: z.string().describe("The fabric code") }),
  run: async () => ({}),
};

const guide: Skill = {
  id: "warehouse-fabric-guide",
  title: "Fabric guide",
  description: "How fabrics are coded.",
  body: "Codes are upper case.",
};

const warehouse: MountedPlugin = {
  definition: definePlugin({
    name: "warehouse",
    title: "Warehouse",
    description: "The record.",
    ops: [find],
  }),
  skills: [guide],
};

const domain = (name: string, uses: { ops?: string[]; skills?: string[] }) => ({
  definition: definePlugin({
    name,
    title: name,
    description: "A domain.",
    ops: [{ ...find, name: "push" }],
    uses,
  }),
  skills: [],
});

test("a domain whose every name is a mounted connector's op or skill resolves", () => {
  assert.deepEqual(
    unresolvedUses([
      warehouse,
      domain("pim", {
        ops: ["warehouse-find-fabric"],
        skills: ["warehouse-fabric-guide"],
      }),
    ]),
    [],
  );
});

test("a plugin that uses nothing resolves", () => {
  assert.deepEqual(unresolvedUses([warehouse]), []);
});

test("a name of a plugin the deployment does not mount does not resolve", () => {
  assert.deepEqual(
    unresolvedUses([domain("pim", { ops: ["odoo-write-value"] })]),
    [
      "pim uses odoo-write-value, and the deployment mounts no op odoo-write-value",
    ],
  );
});

test("a name of an op its plugin does not have does not resolve", () => {
  assert.deepEqual(
    unresolvedUses([
      warehouse,
      domain("pim", { ops: ["warehouse-drop-fabric"] }),
    ]),
    [
      "pim uses warehouse-drop-fabric, and the deployment mounts no op warehouse-drop-fabric",
    ],
  );
});

test("a name of a skill its plugin does not have does not resolve", () => {
  assert.deepEqual(
    unresolvedUses([
      warehouse,
      domain("pim", { skills: ["warehouse-odoo-guide"] }),
    ]),
    [
      "pim uses warehouse-odoo-guide, and the deployment mounts no skill warehouse-odoo-guide",
    ],
  );
});

test("a name of a domain's op does not resolve: a domain uses only connectors", () => {
  assert.deepEqual(
    unresolvedUses([
      warehouse,
      domain("pim", { ops: ["warehouse-find-fabric"] }),
      domain("sales", { ops: ["pim-push"] }),
    ]),
    [
      "sales uses pim-push, and pim is a domain: a domain uses only a connector's ops and skills",
    ],
  );
});

test("a name two plugins give is named, with both plugins: odoo's find-partners and odoo-find's partners", () => {
  const plugin = (name: string, op: string): MountedPlugin => ({
    definition: definePlugin({
      name,
      title: name,
      description: "A connector.",
      ops: [{ ...find, name: op }],
    }),
    skills: [],
  });
  assert.deepEqual(
    sharedNames([
      plugin("odoo", "find-partners"),
      plugin("odoo-find", "partners"),
    ]),
    [
      "odoo-find-partners is a name of odoo and of odoo-find: rename one op or skill, as each name in a deployment is one tool and one node",
    ],
  );
  assert.deepEqual(
    sharedNames([warehouse, plugin("odoo", "find-partners")]),
    [],
  );
});
