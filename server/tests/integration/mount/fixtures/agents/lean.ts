import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "lean",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
