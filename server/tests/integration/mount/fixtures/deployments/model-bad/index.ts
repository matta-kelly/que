import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "model-bad",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/bad-price.ts"],
});
