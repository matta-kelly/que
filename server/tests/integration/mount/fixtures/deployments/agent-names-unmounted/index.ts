import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "agent-names-unmounted",
  packages: ["../../packages/alpha"],
  agent: { packages: ["alpha", "delta"] },
});
