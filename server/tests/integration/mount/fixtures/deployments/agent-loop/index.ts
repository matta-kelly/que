import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-loop",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/looped.ts", "../../agents/lean.ts"],
  loops: ["../../loops/short-run.ts", "../../loops/long-chat.ts"],
});
