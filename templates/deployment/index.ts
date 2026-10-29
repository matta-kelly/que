import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "my-deployment",
  type: "deployment",
  description: "What this deployment is for: who uses it, and where it runs.",
  // The plugins it uses, by name: each one an npm package, installed in this folder or a folder above it, as Node finds
  // an import, whose real folder is in this deployment's root (basis.config.ts). A plugin in a repo of its own packages
  // is linked in by npm workspaces.
  plugins: [],
  // Its agents, by name, at least one: each a file in agents/. A run names the one it wants, and a chat gets the first.
  agents: ["chat"],
  // Its loops, by name, at least one: each a file in loops/. How a chat is handled as it grows. An agent names one.
  loops: ["long-chat"],
  // Its models, by name, at least one: each a file in models/. An agent names one, and a run can name another.
  models: ["glm-flash"],
});
