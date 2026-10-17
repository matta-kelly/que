import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-names-unmounted",
  packages: ["../../packages/alpha"],
  agents: ["../../agents/wants-delta.ts"],
  models: ["../../models/small.ts"],
});
