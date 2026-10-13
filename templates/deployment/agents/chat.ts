import { defineAgent } from "@que/core";

// One way this deployment's packages are run. Only `name` is needed: each
// other field is optional, and what is left out has que's own value.
export default defineAgent({
  name: "chat",
  // packages: [],            names, out of the ones the deployment lists
  // model: "glm-flash",      the name of a model config the deployment lists
  // instructions: "...",     opens the system prompt, in place of que's own role text
  // loading: "on-demand",    how the model is shown its packages
  // loop: "long-chat",       the name of a loop config the deployment lists
  // userInstructions: true,  the prompt gets the user's own instructions
});
