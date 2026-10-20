// Breaks the contract on purpose: a deployment lists at least one model.
export default {
  name: "models-none",
  plugins: ["../../plugins/alpha"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
};
