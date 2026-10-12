import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "local-setup",
  packages: ["../../packages/alpha"],
  user: "none",
  credentials: "env",
});
