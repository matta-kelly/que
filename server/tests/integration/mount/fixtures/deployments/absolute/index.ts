import { join } from "node:path";
import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "absolute",
  plugins: [join(import.meta.dirname, "../../plugins/beta")],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
