import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-loop-unlisted",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/looped.ts"],
  loops: ["../../loops/short-run.ts"],
  models: ["../../models/small.ts"],
});
