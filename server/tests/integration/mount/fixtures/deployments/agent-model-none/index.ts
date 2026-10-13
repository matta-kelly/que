import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-model-none",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/lean.ts"],
});
