import { defineDeployment } from "@que/core";

// Its name is not the name of its folder, so the two can be told apart.
export default defineDeployment({
  name: "declared",
  packages: ["../../packages/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
