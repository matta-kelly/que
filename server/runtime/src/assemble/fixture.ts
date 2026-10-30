import * as z from "zod";
import {
  cardOf,
  definePlugin,
  type Definition,
  type Skill,
} from "@mku1tra/que-plugin";
import type { MountedPlugin } from "../mount/plugins.js";
import type { Catalog } from "../access/catalog.js";

/** A mounted plugin, as mount makes one: its definition, its skills, and the card checkedCard makes of them. */
const mounted = (
  definition: Definition,
  skills: Skill[] = [],
): MountedPlugin => ({
  definition,
  skills,
  card: cardOf({ definition, cases: [], skills }),
});

/** A catalog with one fake plugin, for the tests in this folder. */
export const catalog: Catalog = [
  {
    plugin: mounted(
      definePlugin({
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
      [
        {
          name: "shop-refunds",
          type: "skill",
          title: "Refunds",
          description: "How to refund an order.",
          body: "Refund steps.",
        },
      ],
    ),
    identity: { id: 7, name: "User Seven" },
  },
];

/** The same plugin with its operations taken out: skills alone. */
export const skillsOnly: Catalog = [
  {
    plugin: mounted(
      {
        ...catalog[0].plugin.definition,
        plugin: { ...catalog[0].plugin.definition.plugin, ops: [] },
        ops: [],
      },
      catalog[0].plugin.skills,
    ),
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
    plugin: mounted(notes, [
      {
        name: "notes-meetings",
        type: "skill",
        title: "Meetings",
        description: "How to write up a meeting.",
        body: "Meeting steps.",
      },
    ]),
  },
];

/** A plugin that declares its identity and nothing else. */
export const identityOnly: Catalog = [{ plugin: mounted(notes) }];

/** A plugin that holds nothing, listed before one with operations and a skill. */
export const besideNothing: Catalog = [
  { plugin: mounted(notes) },
  { plugin: catalog[0].plugin },
];
