import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "que-chat-no-model",
  packages: [],
  agents: ["../../../../../../agents/chat.ts"],
  loops: ["../../../../../../loops/long-chat.ts"],
});
