import { definePlugin } from "@que/core";

export default definePlugin({
  name: "domain",
  title: "Domain",
  description: "A domain that uses source's op and skill.",
  uses: { ops: ["source-find"], skills: ["source-guide"] },
});
