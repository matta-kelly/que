import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "models-one-name",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  models: ["../../models/small.ts", "../../models/small-again.ts"],
});
