import { definePlugin } from "@que/plugin";
import * as z from "zod";

export default definePlugin({
  name: "source",
  title: "Source",
  description: "A connector, with one op and one skill a domain can use.",
  ops: [
    {
      name: "find",
      title: "Find",
      description: "Find a thing by its code.",
      schema: z.object({ code: z.string().describe("The thing's code") }),
      run: async () => ({}),
    },
  ],
});
