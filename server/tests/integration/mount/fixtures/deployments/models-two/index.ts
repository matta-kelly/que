import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "models-two",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  models: ["../../models/big.ts", "../../models/small.ts"],
});
