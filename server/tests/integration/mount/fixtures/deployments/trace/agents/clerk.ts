import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "clerk",
  type: "agent",
  description:
    "The agent of a fixture that uses the till, and a domain that uses the warehouse's reader role.",
  plugins: ["till", "roles-domain"],
  model: "small",
  loop: "long-chat",
  // Every op a tool from the start: the tests on this fixture call an op with no load.
  loading: "eager",
});
