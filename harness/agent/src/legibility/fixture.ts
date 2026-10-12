import * as z from "zod";
import { definePackage } from "@que/core";
import type { Catalog } from "./tools.js";

/** A catalog with one fake package, for the tests in this folder. */
export const catalog: Catalog = [
  {
    pkg: {
      definition: definePackage({
        name: "shop",
        title: "Shop",
        description: "The shop's order system.",
        ops: [
          {
            name: "findOrders",
            title: "Find orders",
            description:
              "Search orders by customer name. Returns at most 20, newest first.",
            schema: z.object({
              customer: z.string().describe("Customer name"),
            }),
            run: async () => [],
          },
          {
            name: "getOrder",
            title: "Get order",
            description:
              "One order with its lines. Use findOrders for a search.",
            schema: z.object({ id: z.number().describe("Order id") }),
            run: async () => ({}),
          },
        ],
      }),
      skills: [
        {
          id: "shop/refunds",
          title: "Refunds",
          description: "How to refund an order.",
          body: "Refund steps.",
        },
      ],
    },
    identity: { id: 7, name: "Rep Seven" },
  },
];

/** The same package with its operations taken out: skills alone. */
export const skillsOnly: Catalog = [
  {
    pkg: {
      ...catalog[0].pkg,
      definition: { ...catalog[0].pkg.definition, ops: [] },
    },
  },
];

const notes = definePackage({
  name: "notes",
  title: "Notes",
  description: "How the team writes things down.",
  ops: [],
});

/** One package with operations beside one with skills alone. */
export const mixed: Catalog = [
  catalog[0],
  {
    pkg: {
      definition: notes,
      skills: [
        {
          id: "notes/meetings",
          title: "Meetings",
          description: "How to write up a meeting.",
          body: "Meeting steps.",
        },
      ],
    },
  },
];

/** A package that declares its identity and nothing else. */
export const identityOnly: Catalog = [
  { pkg: { definition: notes, skills: [] } },
];
