import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "looped",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
