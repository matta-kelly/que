import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "my-deployment",
  // Folders of the packages this deployment uses, taken from this folder. A package can sit
  // outside it, as in a repo with its own packages/: "../packages/odoo".
  packages: [],
  // One file per agent config, at least one. A run names the one it wants, and a chat gets the first.
  agents: ["./agents/chat.ts"],
  // One file per loop config, at least one: how a chat is handled as it grows. An agent names one.
  loops: ["./loops/long-chat.ts"],
  // One file per model config, at least one. An agent names one, and a run can name another.
  models: ["./models/glm-flash.ts"],
});
