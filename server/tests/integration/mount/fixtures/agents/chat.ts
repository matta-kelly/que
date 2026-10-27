import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "chat",
  plugins: ["alpha"],
  model: "small",
  loop: "long-chat",
  instructions: "You help the sales team.",
});
