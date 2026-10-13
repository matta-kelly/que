import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "loops-one-name",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  loops: ["../../loops/long-chat.ts", "../../loops/long-chat-again.ts"],
});
