import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "long-chat",
  summarize: { at: 0.7 },
});
