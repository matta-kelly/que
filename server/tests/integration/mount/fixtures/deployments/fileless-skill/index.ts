import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "fileless-skill",
  plugins: ["../../plugins/fileless-skill"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
