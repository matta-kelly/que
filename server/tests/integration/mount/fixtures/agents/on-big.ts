import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "on-big",
  plugins: [],
  model: "big",
  loop: "long-chat",
});
