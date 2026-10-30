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
