// A model that breaks the contract: its price is not in the shape.
export default {
  name: "bad-price",
  id: "fireworks:small-model",
  maxTokens: 8_000,
  price: { input: "cheap" },
};
