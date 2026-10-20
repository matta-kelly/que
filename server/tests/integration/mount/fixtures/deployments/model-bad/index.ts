import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "model-bad",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/bad-price.ts"],
});
