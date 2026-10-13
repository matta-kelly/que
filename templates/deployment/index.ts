import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "my-deployment",
  // Folders of the packages this deployment uses, taken from this folder.
  packages: [],
  // How the agent runs: `packages` (names, out of the ones above), `model` and
  // `instructions`. Each is optional, and what is left out has que's own value.
  agent: {},
});
