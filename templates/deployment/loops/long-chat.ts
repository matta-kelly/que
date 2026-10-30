import { defineLoop } from "@mku1tra/que-harness";

// One way an agent's loop is run: a file of its own in loops/, which the deployment names. An agent names it with
// `loop`. Only `name`, `type` and `description` are needed: each other field is optional, and what is left out has
// que's own value. A setting can be `false`: off. Agents on one model id must summarize alike, as pi sets compaction
// per model id: mount stops on two whose loops' `summarize` differ. Give one a model with another id, or make them alike.
export default defineLoop({
  name: "long-chat",
  type: "loop",
  description: "A loop for long chats.",
  // result: { max: 20_000 },                     tokens. A bigger tool result is not put in the chat whole
  // summarize: { at: 0.85, keep: 0.1 },          shares of the model's window: where a summary starts, and what is sent as it is
  // args: { max: 2_000 },                        characters. A longer argument of an old tool call is cut. Does not act yet
  // limits: { modelCalls: 50, toolCalls: 100 },  the most of each in one run. Does not act yet
});
