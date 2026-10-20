import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-file-missing",
  plugins: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/nope.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
