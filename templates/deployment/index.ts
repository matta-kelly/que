import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "my-deployment",
  type: "deployment",
  description: "What this deployment is for: who uses it, and where it runs.",
  // The plugins it uses, by name: each one an npm package, installed in this folder or a folder above it, as Node finds
  // an import, whose real folder is in this deployment's root (basis.config.ts). A plugin in a repo of its own packages
  // is linked in by npm workspaces.
  plugins: [],
});
