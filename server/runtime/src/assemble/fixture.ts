import * as z from "zod";
import { definePlugin } from "@mku1tra/que-plugin";
import type { Catalog } from "../access/catalog.js";

/** A catalog with one fake plugin, for the tests in this folder. */
export const catalog: Catalog = [
  {
    plugin: {
      definition: definePlugin({
        name: "shop",
        type: "plugin",
        title: "Shop",
        description: "The shop's order system.",
        ops: [
          {
            name: "shop-find-orders",
            type: "op",
            title: "Find orders",
            description:
              "Search orders by customer name. Returns at most 20, newest first.",
            input: z.object({
              customer: z.string().describe("Customer name"),
            }),
            run: async () => [],
          },
          {
            name: "shop-get-order",
            type: "op",
            title: "Get order",
            description:
              "One order with its lines. Use shop-find-orders for a search.",
            input: z.object({ id: z.number().describe("Order id") }),
            run: async () => ({}),
          },
        ],
      }),
      skills: [
        {
          name: "shop-refunds",
          type: "skill",
          title: "Refunds",
          description: "How to refund an order.",
          body: "Refund steps.",
        },
      ],
    },
    identity: { id: 7, name: "User Seven" },
  },
];

/** The same plugin with its operations taken out: skills alone. */
export const skillsOnly: Catalog = [
  {
    plugin: {
      ...catalog[0].plugin,
      definition: {
        ...catalog[0].plugin.definition,
        plugin: { ...catalog[0].plugin.definition.plugin, ops: [] },
        ops: [],
      },
    },
  },
];

const notes = definePlugin({
  name: "notes",
  type: "plugin",
  title: "Notes",
  description: "How the team writes things down.",
  ops: [],
});

/** One plugin with operations beside one with skills alone. */
export const mixed: Catalog = [
  catalog[0],
  {
    plugin: {
      definition: notes,
      skills: [
        {
          name: "notes-meetings",
          type: "skill",
          title: "Meetings",
          description: "How to write up a meeting.",
          body: "Meeting steps.",
        },
      ],
    },
  },
];

/** A plugin that declares its identity and nothing else. */
export const identityOnly: Catalog = [
  { plugin: { definition: notes, skills: [] } },
];

/** A plugin that holds nothing, listed before one with operations and a skill. */
export const besideNothing: Catalog = [
  { plugin: { definition: notes, skills: [] } },
  { plugin: catalog[0].plugin },
];
