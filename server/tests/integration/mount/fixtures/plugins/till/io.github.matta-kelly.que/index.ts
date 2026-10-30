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
  ],
});
