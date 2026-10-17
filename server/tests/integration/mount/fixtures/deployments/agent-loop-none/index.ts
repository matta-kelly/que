import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-loop-none",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/looped.ts"],
  loops: [],
  models: ["../../models/small.ts"],
});
