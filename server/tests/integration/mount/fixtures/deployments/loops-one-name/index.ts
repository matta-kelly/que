import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "loops-one-name",
  plugins: ["../../packages/gamma", "../../packages/alpha"],
  loops: ["../../loops/long-chat.ts", "../../loops/long-chat-again.ts"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
