import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "shop",
  packages: ["../../packages/shop", "../../packages/notes"],
  agents: [
    "../../agents/chat.ts",
    "../../agents/lean.ts",
    "../../agents/notes-only.ts",
  ],
});
