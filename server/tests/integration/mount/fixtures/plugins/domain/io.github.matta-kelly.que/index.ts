import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

export default definePlugin({
  name: "domain",
  type: "plugin",
  kind: "domain",
  title: "Domain",
  description:
    "A domain whose op and skill use source's op, and which uses source's skill.",
  ops: [
    {
      name: "domain-sync",
      type: "op",
      title: "Sync",
      description: "Sync a thing from source by its code.",
      uses: ["source-find"],
      input: z.object({ code: z.string().describe("The thing's code") }),
      run: async () => ({}),
    },
  ],
  usesSkills: ["source-guide"],
});
