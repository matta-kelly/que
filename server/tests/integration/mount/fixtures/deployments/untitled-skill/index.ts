import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "untitled-skill",
  packages: ["../../packages/untitled-skill"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
