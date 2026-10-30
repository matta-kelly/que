import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-loops-alike",
  type: "deployment",
  description:
    "A deployment of a fixture with two agents on one model whose loops differ, but summarize alike.",
  plugins: ["alpha"],
  agents: ["teller", "keeper"],
  loops: ["long-chat", "long-chat-whole"],
  models: ["small"],
});
