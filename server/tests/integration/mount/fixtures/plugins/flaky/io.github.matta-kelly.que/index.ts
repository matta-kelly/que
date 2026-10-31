import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

// An internal connector whose connect always fails, so a test can see a login that cannot be proved is not saved.
export default definePlugin({
  name: "flaky",
  type: "plugin",
  title: "Flaky",
  description:
    "An internal connector that cannot be reached: its connect throws, whatever the values.",
  credential: z.object({ url: z.string().describe("The flaky service's URL") }),
  connect: async () => {
    throw new Error("flaky is down");
  },
  roles: [
    {
      name: "flaky-reader",
      type: "access-role",
      description: "Reads the flaky service.",
    },
  ],
  ops: [
    {
      name: "flaky-read",
      type: "op",
      title: "Read",
      description: "Read from the flaky service.",
      role: "flaky-reader",
      input: z.object({ item: z.string().describe("The item's name") }),
      run: async () => ({}),
    },
  ],
});
