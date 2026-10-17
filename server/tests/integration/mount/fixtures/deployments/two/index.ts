import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "two",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
