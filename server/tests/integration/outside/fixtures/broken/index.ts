import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "broken-outside",
  packages: ["./packages/untitled"],
  agents: ["./agents/bare.ts"],
  loops: ["./loops/long-chat.ts"],
  models: ["./models/small.ts"],
});
