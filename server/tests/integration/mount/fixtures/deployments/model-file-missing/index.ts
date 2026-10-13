import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "model-file-missing",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  models: ["../../models/nope.ts"],
});
