import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "shop",
  plugins: ["../../packages/shop", "../../packages/notes"],
  agents: [
    "../../agents/chat.ts",
    "../../agents/lean.ts",
    "../../agents/notes-only.ts",
  ],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts", "../../models/big.ts"],
});
