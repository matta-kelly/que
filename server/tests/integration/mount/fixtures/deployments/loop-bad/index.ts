import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "loop-bad",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  loops: ["../../loops/endless.ts"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
