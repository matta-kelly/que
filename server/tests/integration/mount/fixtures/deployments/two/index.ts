import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "two",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
