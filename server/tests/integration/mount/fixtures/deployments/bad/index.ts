import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "bad",
  packages: ["../../packages/bad"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
