// Breaks the contract on purpose: plugins must be a list.
export default {
  name: "broken",
  plugins: "../../plugins/alpha",
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
};
