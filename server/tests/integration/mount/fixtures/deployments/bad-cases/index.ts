import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "bad-cases",
  packages: ["../../packages/bad-cases"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
