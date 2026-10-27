import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "wants-delta",
  plugins: ["alpha", "delta"],
  model: "small",
  loop: "long-chat",
});
