import { defineAgent } from "@que/core";

// The chat agent again, run as a LangChain deep agent: the same model, role
// text and loading, with the `deep` loop. A deployment that lists both can
// run its packages each way.
export default defineAgent({
  name: "deep-chat",
  model: "minimax-m3",
  instructions: `You are a helpful assistant.

- Be concise and accurate.
- If you're unsure about something, say so rather than guessing.`,
  loading: "on-demand",
  loop: "deep",
  userInstructions: true,
});
