import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "stray",
  title: "Stray",
  description: "A domain that uses an op source does not have.",
  uses: { ops: ["source-lose"] },
});
