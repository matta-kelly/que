import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "models-bare",
  packages: [],
  agents: ["../../agents/on-big.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/big.ts", "../../models/bare.ts"],
});
