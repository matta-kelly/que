import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-loop-unlisted",
  plugins: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/looped.ts"],
  loops: ["../../loops/short-run.ts"],
  models: ["../../models/small.ts"],
});
