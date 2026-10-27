import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "bad-cases",
  plugins: ["../../plugins/bad-cases"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
