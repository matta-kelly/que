import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "model-provider",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  models: ["../../models/elsewhere.ts"],
});
