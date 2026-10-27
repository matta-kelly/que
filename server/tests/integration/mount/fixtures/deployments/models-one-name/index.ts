import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "models-one-name",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts", "../../models/small-again.ts"],
});
