import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

export default definePlugin({
  name: "source",
  type: "plugin",
  title: "Source",
  description: "A connector, with one op and one skill a domain can use.",
  ops: [
    {
      name: "source-find",
      type: "op",
      title: "Find",
      description: "Find a thing by its code.",
      input: z.object({ code: z.string().describe("The thing's code") }),
      run: async () => ({}),
    },
  ],
});
