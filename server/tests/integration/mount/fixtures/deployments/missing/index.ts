import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "missing",
  packages: ["../../packages/nope"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
