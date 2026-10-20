import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agents-one-name",
  plugins: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/chat.ts", "../../agents/chat-again.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
