import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "broken-outside",
  plugins: ["./packages/untitled"],
  agents: ["./agents/bare.ts"],
  loops: ["./loops/long-chat.ts"],
  models: ["./models/small.ts"],
});
