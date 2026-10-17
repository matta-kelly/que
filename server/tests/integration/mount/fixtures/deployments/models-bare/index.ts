import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "models-bare",
  packages: [],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/big.ts", "../../models/bare.ts"],
});
