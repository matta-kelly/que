import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "no-cases",
  packages: ["../../packages/notes"],
  agents: ["../../agents/chat.ts"],
});
