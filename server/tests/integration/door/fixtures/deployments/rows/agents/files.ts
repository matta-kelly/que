import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "files",
  type: "agent",
  description:
    "The agent of a fixture whose op counts a file's rows, offered from the first request.",
  plugins: ["rows-domain"],
  model: "small",
  loop: "long-chat",
  loading: "eager",
});
