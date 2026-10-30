import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "small-result",
  type: "loop",
  description:
    "The small-result loop of a fixture: a result over 10 tokens is moved to a file.",
  result: { max: 10 },
  summarize: false,
});
