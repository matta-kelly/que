import * as z from "zod";
import { Name } from "@mku1tra/basis";
import { definePlugin, OpFailed, plugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "notes",
  title: "Notes",
  description: "A plugin that sits in its deployment's folder, outside que.",
  ops: [
    {
      name: "find",
      title: "Find",
      description: "Finds a note by its title.",
      schema: z.object({
        title: z.string().describe("The note's title"),
        // basis, supplied by que like zod.
        folder: Name.optional().describe("The folder the note is in"),
        // The plugin schema, supplied by que in @mku1tra/que-plugin.
        capability: plugin.types.capability.schema.shape.name
          .optional()
          .describe("The capability the note is about"),
      }),
      run: async () => {
        throw new OpFailed("the notes are not reachable");
      },
    },
  ],
});
