import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "models-two",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/big.ts", "../../models/small.ts"],
});
