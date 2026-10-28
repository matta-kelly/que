import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "capability-twice",
  plugins: ["../../plugins/shop", "../../plugins/shop-twin"],
  agents: ["../../agents/chat.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
