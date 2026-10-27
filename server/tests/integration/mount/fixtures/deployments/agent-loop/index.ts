import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "agent-loop",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  agents: ["../../agents/looped.ts", "../../agents/lean.ts"],
  loops: ["../../loops/short-run.ts", "../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
