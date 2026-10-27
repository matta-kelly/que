import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "loop-file-missing",
  plugins: ["../../plugins/gamma", "../../plugins/alpha"],
  loops: ["../../loops/nope.ts"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
