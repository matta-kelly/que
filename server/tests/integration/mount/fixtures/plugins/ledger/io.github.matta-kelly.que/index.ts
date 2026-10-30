import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import * as z from "zod";

export default definePlugin({
  name: "ledger",
  type: "plugin",
  title: "Ledger",
  description:
    "A ledger whose report is as long as it is asked for, so a chat can fill a share of a model's window, and whose entry below zero fails.",
  ops: [
    {
      name: "ledger-report",
      type: "op",
      title: "Report",
      description: "A report of `size` characters, headed by its mark.",
      input: z.object({
        mark: z.string().describe("The report's mark, its first word"),
        size: z.number().describe("How many characters of rows follow it"),
      }),
      run: async (_, { mark, size }) => `${mark} ${"r".repeat(size)}`,
    },
    {
      name: "ledger-get",
      type: "op",
      title: "Get",
      description: "One entry of the ledger. An id below zero is no entry.",
      input: z.object({ id: z.number().describe("The entry's id") }),
      run: async (_, { id }) => {
        if (id < 0) throw new OpFailed("no such entry");
        return { id };
      },
    },
  ],
});
