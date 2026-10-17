import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "broken-outside",
  packages: ["./packages/untitled"],
  agents: ["./agents/bare.ts"],
  models: ["./models/small.ts"],
});
