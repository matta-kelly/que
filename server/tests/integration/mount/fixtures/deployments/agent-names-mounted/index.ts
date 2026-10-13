import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-names-mounted",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  agent: { packages: ["alpha"], instructions: "You help the sales team." },
});
