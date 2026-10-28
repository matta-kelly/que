import { defineAgent } from "@mku1tra/que-harness";

// One way this deployment's plugins are run: a file of its own in agents/, which the deployment names. `name`, `type`,
// `description`, `model` and `loop` are needed. Each other field is optional, and says below what it is when left out.
export default defineAgent({
  name: "chat",
  type: "agent",
  description: "The agent a chat gets.",
  // names, out of the ones the deployment names. Left out or `[]`: none
  plugins: [],
  // the name of a model the deployment names. A run can name another
  model: "glm-flash",
  // the name of a loop the deployment names
  loop: "long-chat",
  // instructions: "...",     opens the system prompt. Left out: que's role text
  // loading: "eager",        how the model is shown its packages. Left out: on-demand
  // userInstructions: true,  the prompt gets the user's own instructions. Left out: none
});
