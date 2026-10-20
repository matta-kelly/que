import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "outside",
  plugins: ["./plugins/notes"],
  agents: ["./agents/bare.ts"],
  loops: ["./loops/long-chat.ts"],
  models: ["./models/small.ts"],
});
