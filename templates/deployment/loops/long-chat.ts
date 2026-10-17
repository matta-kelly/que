import { defineLoop } from "@que/core";

// One way an agent's loop is run. An agent config names it with `loop`. Only
// `name` is needed: each other field is optional, and what is left out has
// que's own value. A setting can be `false`: off.
export default defineLoop({
  name: "long-chat",
  // result: { max: 20_000 },                     tokens. A bigger tool result is not put in the chat whole
  // summarize: { at: 0.85, keep: 0.1 },          shares of the model's window: where a summary starts, and what is sent as it is
  // args: { max: 2_000 },                        characters. A longer argument of an old tool call is cut. Does not act yet
  // limits: { modelCalls: 50, toolCalls: 100 },  the most of each in one run. Does not act yet
});
