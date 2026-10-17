import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "models-one-name",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts", "../../models/small-again.ts"],
});
