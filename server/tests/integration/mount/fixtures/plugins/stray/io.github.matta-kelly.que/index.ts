import { definePlugin } from "@que/core";

export default definePlugin({
  name: "stray",
  title: "Stray",
  description: "A domain that uses an op source does not have.",
  uses: { ops: ["source-lose"] },
});
