import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "my-deployment",
  // Folders of the packages this deployment uses, taken from this folder.
  packages: [],
  // One file per agent config. A run names the one it wants, and a chat gets the first.
  agents: ["./agents/chat.ts"],
  // One file per loop config: how a chat is handled as it grows.
  loops: ["./loops/long-chat.ts"],
  // One file per model config. An agent names one, and so can a run; with neither, a run gets the first.
  models: ["./models/glm-flash.ts"],
});
