import * as z from "zod";
import { Name } from "basis";
import { definePackage, OperationFailed } from "@que/core";

export default definePackage({
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
      }),
      run: async () => {
        throw new OperationFailed("the notes are not reachable");
      },
    },
  ],
});
