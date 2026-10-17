import { join } from "node:path";
import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "absolute",
  packages: [join(import.meta.dirname, "../../packages/beta")],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
