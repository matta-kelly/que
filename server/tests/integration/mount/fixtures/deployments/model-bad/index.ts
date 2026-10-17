import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "model-bad",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/bad-price.ts"],
});
