import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "fileless-skill",
  packages: ["../../packages/fileless-skill"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
