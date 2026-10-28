import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "modelless",
  type: "agent",
  description: "The modelless agent of a fixture.",
  plugins: [],
  model: "",
  loop: "long-chat",
});
