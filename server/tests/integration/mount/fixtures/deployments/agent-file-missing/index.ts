import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-file-missing",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/nope.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
