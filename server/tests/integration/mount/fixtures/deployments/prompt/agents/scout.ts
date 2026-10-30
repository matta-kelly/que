import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "scout",
  type: "agent",
  description:
    "The agent of a fixture on clerk's plugins, the till and alpha, that loads each op on demand, and takes the user's own instructions.",
  plugins: ["till", "alpha"],
  model: "small",
  loop: "long-chat",
  loading: "on-demand",
  userInstructions: true,
});
