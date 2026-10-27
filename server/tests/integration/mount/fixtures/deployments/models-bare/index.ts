import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "models-bare",
  plugins: [],
  agents: ["../../agents/on-big.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/big.ts", "../../models/bare.ts"],
});
