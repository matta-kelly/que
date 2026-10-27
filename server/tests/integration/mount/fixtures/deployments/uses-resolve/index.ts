import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "uses-resolve",
  plugins: ["../../plugins/source", "../../plugins/domain"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
