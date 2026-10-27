import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "bad",
  plugins: ["../../plugins/bad"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
