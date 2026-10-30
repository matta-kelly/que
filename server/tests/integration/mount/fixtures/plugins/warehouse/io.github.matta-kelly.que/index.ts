import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

export default definePlugin({
  name: "warehouse",
  type: "plugin",
  title: "Warehouse",
  description:
    "An internal connector whose ops run with one of its roles, for a domain to use.",
  credential: z.object({ url: z.string().describe("The warehouse URL") }),
  connect: async ({ url }) => `warehouse:${url}`,
  roles: [
    {
      name: "warehouse-reader",
      type: "access-role",
      description: "Reads the warehouse.",
    },
    {
      name: "warehouse-writer",
      type: "access-role",
      description: "Writes the warehouse.",
    },
  ],
  ops: [
    {
      name: "warehouse-search",
      type: "op",
      title: "Search",
      description: "Search the warehouse by a code.",
      role: "warehouse-reader",
      input: z.object({ code: z.string().describe("The thing's code") }),
      run: async () => ({}),
    },
    {
      name: "warehouse-store",
      type: "op",
      title: "Store",
      description: "Store a thing in the warehouse.",
      role: "warehouse-writer",
      input: z.object({ code: z.string().describe("The thing's code") }),
      run: async () => ({}),
    },
  ],
});
