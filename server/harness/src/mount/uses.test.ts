import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { definePlugin, type Skill } from "@que/core";
import type { MountedPlugin } from "./plugins.js";
import { unresolvedUses } from "./uses.js";

const find = {
  name: "findFabric",
  title: "Find a fabric",
  description: "Find a fabric by its code.",
  schema: z.object({ code: z.string().describe("The fabric code") }),
  run: async () => ({}),
};

const guide: Skill = {
  id: "warehouse/fabric-guide",
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
        ops: ["warehouse_findFabric"],
        skills: ["warehouse/fabric-guide"],
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
    unresolvedUses([domain("pim", { ops: ["odoo_writeValue"] })]),
    ["pim uses odoo_writeValue, and the deployment mounts no plugin odoo"],
  );
});

test("a name of an op its plugin does not have does not resolve", () => {
  assert.deepEqual(
    unresolvedUses([
      warehouse,
      domain("pim", { ops: ["warehouse_dropFabric"] }),
    ]),
    ["pim uses warehouse_dropFabric, and warehouse has no op dropFabric"],
  );
});

test("a name of a skill its plugin does not have does not resolve", () => {
  assert.deepEqual(
    unresolvedUses([
      warehouse,
      domain("pim", { skills: ["warehouse/odoo-guide"] }),
    ]),
    ["pim uses warehouse/odoo-guide, and warehouse has no skill odoo-guide"],
  );
});

test("a name of a domain's op does not resolve: a domain uses only connectors", () => {
  assert.deepEqual(
    unresolvedUses([
      warehouse,
      domain("pim", { ops: ["warehouse_findFabric"] }),
      domain("sales", { ops: ["pim_push"] }),
    ]),
    [
      "sales uses pim_push, and pim is a domain: a domain uses only a connector's ops and skills",
    ],
  );
});

test("an op name with an underscore splits at the first one, the end of the plugin's name", () => {
  const snake: MountedPlugin = {
    definition: definePlugin({
      name: "warehouse",
      title: "Warehouse",
      description: "The record.",
      ops: [{ ...find, name: "find_fabric" }],
    }),
    skills: [],
  };
  assert.deepEqual(
    unresolvedUses([snake, domain("pim", { ops: ["warehouse_find_fabric"] })]),
    [],
  );
});
