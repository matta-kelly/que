import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "bad-cases",
  plugins: ["../../plugins/bad-cases"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
