import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "unlisted-skill",
  plugins: ["../../plugins/unlisted-skill"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
