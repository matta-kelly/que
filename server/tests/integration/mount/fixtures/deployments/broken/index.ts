// Breaks the contract on purpose: packages must be a list.
export default {
  name: "broken",
  packages: "../../packages/alpha",
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
};
