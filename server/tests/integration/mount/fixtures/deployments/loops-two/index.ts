import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "loops-two",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  loops: ["../../loops/short-run.ts", "../../loops/long-chat.ts"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
