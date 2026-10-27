import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "bare",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
