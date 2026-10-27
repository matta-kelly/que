import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "chat",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
