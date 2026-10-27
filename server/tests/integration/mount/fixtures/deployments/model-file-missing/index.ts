import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-file-missing",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/nope.ts"],
});
