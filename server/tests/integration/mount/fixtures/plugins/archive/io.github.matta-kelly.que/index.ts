import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

// A connector of a user's own (it has no roles), so a test can see the admin API refuse it a role's login.
export default definePlugin({
  name: "archive",
  type: "plugin",
  title: "Archive",
  description:
    "A third-party connector, on a key of each user's own: it has no roles of its own.",
  credential: z.object({ token: z.string().describe("The archive's key") }),
  connect: async ({ token }) => `archive:${token}`,
  ops: [
    {
      name: "archive-get",
      type: "op",
      title: "Get",
      description: "Get an item from the archive.",
      input: z.object({ item: z.string().describe("The item's name") }),
      run: async () => ({}),
    },
  ],
});
