import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

export default definePlugin({
  name: "interop-domain",
  type: "plugin",
  kind: "domain",
  title: "Interop domain",
  description: "A domain whose op calls the connector op it lists.",
  ops: [
    {
      name: "interop-sync",
      type: "op",
      title: "Sync",
      description: "Sync a thing through the connector op it lists.",
      uses: ["interop-find"],
      input: z.object({ code: z.string().describe("The thing's code") }),
      run: async ({ ops }, { code }) => ({
        answer: await ops["interop-find"]({ code }),
        listed: Object.keys(ops),
      }),
    },
  ],
});
