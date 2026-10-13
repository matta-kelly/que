import { defineAgent } from "@que/core";

// The agent a chat gets. It names no package, so any deployment can list it,
// and the agent gets every package of that deployment the user can reach.
export default defineAgent({
  name: "chat",
  model: "minimax-m3",
  instructions: `You are a helpful assistant.

- Be concise and accurate.
- If you're unsure about something, say so rather than guessing.`,
  loading: "on-demand",
  loop: "long-chat",
  userInstructions: true,
});
