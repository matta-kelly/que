import * as z from "zod";
import { definePackage, OperationFailed } from "@que/core";

// The package of the test deployment. It reads nothing outside this file.
const BOOKS = ["The Pragmatic Programmer", "The Mythical Man-Month", "Dune"];

/** The one token the shelf takes. It is made up, and opens nothing. */
export const TOKEN = "shelf-test";

export default definePackage({
  name: "shelf",
  title: "Shelf",
  description: "A shelf of three books, for the browser tests.",
  // A credential, so the package has a row in Settings > Connections.
  credential: z.object({ token: z.string() }),
  connect: async ({ token }) => {
    if (token !== TOKEN) throw new OperationFailed("shelf: login failed");
  },
  ops: [
    {
      name: "findBooks",
      title: "Find books",
      description: "Finds the books whose title has the text given.",
      schema: z.object({ title: z.string().describe("Text in the title") }),
      run: async (_ctx, { title }) =>
        BOOKS.filter((book) =>
          book.toLowerCase().includes(title.toLowerCase()),
        ),
    },
  ],
});
