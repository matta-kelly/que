import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agents-two",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/chat.ts", "../../agents/lean.ts"],
});
