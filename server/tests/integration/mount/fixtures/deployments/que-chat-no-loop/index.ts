import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "que-chat-no-loop",
  packages: [],
  agents: ["../../../../../../agents/chat.ts"],
  loops: [],
});
