import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "models-two",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/big.ts", "../../models/small.ts"],
});
