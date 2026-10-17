import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "unlisted-skill",
  packages: ["../../packages/unlisted-skill"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
