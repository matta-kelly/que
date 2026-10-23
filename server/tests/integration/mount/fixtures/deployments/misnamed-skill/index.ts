import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "misnamed-skill",
  plugins: ["../../plugins/misnamed-skill"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
