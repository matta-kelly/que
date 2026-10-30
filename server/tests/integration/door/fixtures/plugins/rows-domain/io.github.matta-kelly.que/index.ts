import { definePlugin } from "@mku1tra/que-plugin";
import * as z from "zod";

export default definePlugin({
  name: "rows-domain",
  type: "plugin",
  kind: "domain",
  title: "Rows",
  description: "A domain whose op counts the rows of one of the run's files.",
  ops: [
    {
      name: "rows-count",
      type: "op",
      title: "Count rows",
      description:
        "Count the rows of a CSV attachment, past its header. The input is a file id from list_attachments.",
      input: z.object({
        file: z.string().describe("A file id from list_attachments"),
      }),
      run: async ({ files }, { file }) => {
        const { name, bytes } = await files.get(file);
        const lines = new TextDecoder().decode(bytes).trimEnd().split("\n");
        return { file: name, rows: lines.length - 1 };
      },
    },
  ],
});
