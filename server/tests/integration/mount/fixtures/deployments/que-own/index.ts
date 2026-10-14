import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "que-own",
  packages: [],
  agents: ["../../../../../../agents/chat.ts"],
  loops: [
    "../../../../../../loops/long-chat.ts",
    "../../../../../../loops/short-run.ts",
  ],
  models: ["../../../../../../models/minimax-m3.ts"],
});
