import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "loops-one-name",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  loops: ["../../loops/long-chat.ts", "../../loops/long-chat-again.ts"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
