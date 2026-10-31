import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "files",
  type: "agent",
  description:
    "The agent of the issue's acceptance run: it reads a thread's attachments and counts a CSV's rows.",
  plugins: ["rows-domain"],
  model: "glm",
  loop: "long-chat",
  loading: "eager",
});
