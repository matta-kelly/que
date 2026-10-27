import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "missing",
  plugins: ["../../plugins/nope"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
