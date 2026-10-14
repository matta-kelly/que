import { defineAgent } from "@que/core";

// The chat agent again, with eager loading: the same model, role text and
// loop, with every operation in reach from the first message. A deployment
// that lists both can run its packages each way.
export default defineAgent({
  name: "chat-eager",
  model: "minimax-m3",
  instructions: `You are a helpful assistant.

- Be concise and accurate.
- If you're unsure about something, say so rather than guessing.`,
  loading: "eager",
  loop: "long-chat",
  userInstructions: true,
});
