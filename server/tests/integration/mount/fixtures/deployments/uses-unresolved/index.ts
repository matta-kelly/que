import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "uses-unresolved",
  plugins: ["../../plugins/source", "../../plugins/stray"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
