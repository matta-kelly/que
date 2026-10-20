import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-bad",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/modelless.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
