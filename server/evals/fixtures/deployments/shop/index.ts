import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "shop",
  plugins: ["../../plugins/shop", "../../plugins/notes"],
  agents: [
    "../../agents/chat.ts",
    "../../agents/lean.ts",
    "../../agents/notes-only.ts",
  ],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts", "../../models/big.ts"],
});
