import { defineAgent } from "@que/core";

// One way this deployment's plugins are run. `name`, `plugins`, `model` and
// `loop` are needed. Each other field is optional, and says below what it is when left out.
export default defineAgent({
  name: "chat",
  // names, out of the ones the deployment lists. `[]` is none: list each one the agent gets
  plugins: [],
  // the name of a model config the deployment lists. A run can name another
  model: "glm-flash",
  // the name of a loop config the deployment lists
  loop: "long-chat",
  // instructions: "...",     opens the system prompt. Left out: que's role text
  // loading: "eager",        how the model is shown its packages. Left out: on-demand
  // userInstructions: true,  the prompt gets the user's own instructions. Left out: none
});
