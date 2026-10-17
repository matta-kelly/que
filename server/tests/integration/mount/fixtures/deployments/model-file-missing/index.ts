import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "model-file-missing",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/nope.ts"],
});
