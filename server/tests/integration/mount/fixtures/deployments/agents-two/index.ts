import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agents-two",
  plugins: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/chat.ts", "../../agents/lean.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
