import * as z from "zod";
import { Name } from "basis";
import { definePlugin, OperationFailed } from "@que/core";
import { plugin } from "@que/core/ontology";

export default definePlugin({
  name: "notes",
  title: "Notes",
  description: "A package that sits in its deployment's folder, outside que.",
  ops: [
    {
      name: "find",
      title: "Find",
      description: "Finds a note by its title.",
      schema: z.object({
        title: z.string().describe("The note's title"),
        // basis, supplied by que like zod.
        folder: Name.optional().describe("The folder the note is in"),
        // que's ontology, supplied by que as a subpath of `@que/core`.
        capability: plugin.types.capability.schema.shape.name
          .optional()
          .describe("The capability the note is about"),
      }),
      run: async () => {
        throw new OperationFailed("the notes are not reachable");
      },
    },
  ],
});
