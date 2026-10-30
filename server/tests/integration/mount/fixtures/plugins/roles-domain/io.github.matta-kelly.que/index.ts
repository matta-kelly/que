import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

export default definePlugin({
  name: "roles-domain",
  type: "plugin",
  kind: "domain",
  title: "Roles domain",
  description:
    "A domain whose op uses the reader role of the warehouse connector.",
  ops: [
    {
      name: "roles-search",
      type: "op",
      title: "Search",
      description: "Search the warehouse through its reader role.",
      uses: ["warehouse-search"],
      input: z.object({ code: z.string().describe("The thing's code") }),
      run: async () => ({}),
    },
  ],
});
