import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "two",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
