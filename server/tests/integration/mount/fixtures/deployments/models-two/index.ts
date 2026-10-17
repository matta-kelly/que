import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "models-two",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/big.ts", "../../models/small.ts"],
});
