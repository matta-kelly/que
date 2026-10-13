import { defineLoop } from "@que/core";

// A loop run as a LangChain deep agent. A tool result over `result.max` is
// kept in the thread's file store, and the chat gets its head, its tail and
// its path. It holds que's own value for that setting, written out.
export default defineLoop({
  name: "deep",
  engine: "deepagents",
  result: { max: 20_000 },
});
