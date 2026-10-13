import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "models-bare",
  packages: [],
  models: ["../../models/big.ts", "../../models/bare.ts"],
});
