import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "model-provider",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/elsewhere.ts"],
});
