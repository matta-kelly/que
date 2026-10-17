import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-file-missing",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/nope.ts"],
  models: ["../../models/small.ts"],
});
