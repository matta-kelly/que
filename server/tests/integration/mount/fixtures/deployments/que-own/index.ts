import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "que-own",
  packages: [],
  agents: [
    "../../../../../../agents/chat.ts",
    "../../../../../../agents/deep-chat.ts",
  ],
  loops: [
    "../../../../../../loops/long-chat.ts",
    "../../../../../../loops/deep.ts",
  ],
  models: ["../../../../../../models/glm-flash.ts"],
});
