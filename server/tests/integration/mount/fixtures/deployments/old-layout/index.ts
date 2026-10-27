import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "old-layout",
  plugins: ["../../plugins/old-layout"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
