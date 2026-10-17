import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "outside",
  packages: ["./packages/notes"],
  agents: ["./agents/bare.ts"],
  models: ["./models/small.ts"],
});
