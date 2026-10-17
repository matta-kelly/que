import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-model-unlisted",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/lean.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/big.ts"],
});
