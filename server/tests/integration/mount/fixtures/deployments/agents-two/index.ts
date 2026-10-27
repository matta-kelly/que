import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "agents-two",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/chat.ts", "../../agents/lean.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
