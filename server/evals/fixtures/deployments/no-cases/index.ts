import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "no-cases",
  plugins: ["../../plugins/notes"],
  agents: ["../../agents/chat.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
