import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "lean",
  plugins: ["shop", "notes"],
  model: "small",
  loop: "long-chat",
});
