import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-bad",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/modelless.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
