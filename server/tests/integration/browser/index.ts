import { defineDeployment } from "@que/core";

// The deployment the browser tests run que on (`just test`). Its models are
// not real: `.env` sends each model request to the stand-in in provider.ts.
export default defineDeployment({
  name: "browser-tests",
  packages: ["./packages/shelf"],
  // que's two chat agents, and the loops they name.
  agents: ["../../../agents/chat.ts", "../../../agents/deep-chat.ts"],
  loops: ["../../../loops/long-chat.ts", "../../../loops/deep.ts"],
  models: ["./models/minimax-m3.ts", "./models/glm-flash.ts"],
});
