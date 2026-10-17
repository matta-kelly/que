import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "hollow",
  packages: ["../../packages/hollow"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
