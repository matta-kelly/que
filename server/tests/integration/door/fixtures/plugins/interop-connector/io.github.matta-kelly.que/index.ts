import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

export default definePlugin({
  name: "interop-connector",
  type: "plugin",
  title: "Interop connector",
  description:
    "A connector whose ops answer with the login the door asked for, and what they were asked.",
  credential: z.object({ key: z.string().describe("The service key") }),
  connect: async ({ key }) => `interop:${key}`,
  ops: [
    {
      name: "interop-find",
      type: "op",
      title: "Find",
      description: "Find a thing by its code.",
      input: z.object({ code: z.string().describe("The thing's code") }),
      run: async ({ conn }, { code }) => ({ conn, code }),
    },
    {
      name: "interop-other",
      type: "op",
      title: "Other",
      description: "An op the domain does not list.",
      input: z.object({ code: z.string().describe("The thing's code") }),
      run: async ({ conn }, { code }) => ({ conn, code }),
    },
  ],
});
