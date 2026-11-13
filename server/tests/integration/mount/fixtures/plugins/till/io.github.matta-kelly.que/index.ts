import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

export default definePlugin({
  name: "till",
  type: "plugin",
  title: "Till",
  description:
    "A shop's till, on a key of each user's own: its connection names the key.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `till:${key}`,
  ops: [
    {
      name: "till-count",
      type: "op",
      title: "Count",
      description: "How many of an item the till holds.",
      input: z.object({ item: z.string().describe("The item's name") }),
      // What the op got: the connection the door asked for, and the item.
      run: async ({ conn }, { item }) => ({ conn, item }),
    },
    {
      name: "till-tally",
      type: "op",
      title: "Tally",
      description: "Tallies an item.",
      input: z.object({ item: z.string().describe("The item's name") }),
      run: async ({ conn }, { item }) => ({ conn, item, tallied: 3 }),
    },
    {
      name: "till-wait",
      type: "op",
      title: "Wait",
      description:
        "Counts an item slowly: it gives its count after a second and a half, so a run can be stopped while it runs.",
      input: z.object({ item: z.string().describe("The item's name") }),
      run: async (_, { item }) => {
        await new Promise((waited) => setTimeout(waited, 1_500));
        return { item, counted: 3 };
      },
    },
    {
      name: "till-stall",
      type: "op",
      title: "Stall",
      description:
        "Counts an item and takes its time: it gives its count after five seconds, whatever happens to its run, as an op that ignores the abort signal does.",
      input: z.object({ item: z.string().describe("The item's name") }),
      run: async (_, { item }) => {
        await new Promise((waited) => setTimeout(waited, 5_000));
        return { item, counted: 3 };
      },
    },
    {
      name: "till-void",
      type: "op",
      title: "Void",
      description:
        "Voids an item's sale: a write, so it needs the user's yes before it runs.",
      approval: true,
      input: z.object({ item: z.string().describe("The item's name") }),
      run: async ({ conn }, { item }) => ({ conn, item, voided: true }),
    },
    {
      name: "till-note",
      type: "op",
      title: "Note",
      description:
        "Notes what the user says about an item: a read, so the user may answer in the till's place.",
      approval: {
        // A free item is noted as it is, so the door refuses only the items that are not free.
        when: (input) => (input as { item: string }).item !== "free",
      },
      input: z.object({ item: z.string().describe("The item's name") }),
      run: async ({ conn }, { item }) => ({ conn, item, noted: true }),
    },
    {
      name: "till-jam",
      type: "op",
      title: "Jam",
      description:
        "Jams the till on an item: a bug, whose message holds a path.",
      input: z.object({ item: z.string().describe("The item's name") }),
      run: async (_, { item }) => {
        throw new Error(`secret ${item} at /x/y.ts:1:2`);
      },
    },
  ],
});
