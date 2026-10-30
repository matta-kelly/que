import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

/** The errors the domain op's listed call threw, as its run caught them: a test reads it to see the domain op got the failure. */
export const listedCallFailures: unknown[] = [];

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
      run: async ({ ops }, { code }) => {
        let answer;
        try {
          answer = await ops["interop-find"]({ code });
        } catch (error) {
          listedCallFailures.push(error);
          throw error;
        }
        return { answer, listed: Object.keys(ops) };
      },
    },
  ],
});
