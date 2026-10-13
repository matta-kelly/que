import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "model-bad",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  models: ["../../models/windowless.ts"],
});
