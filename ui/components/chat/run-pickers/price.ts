// A model's price, as the model picker writes it.

import type { ModelPrice } from "../../../lib/que-api.ts";

/** One number of a price, with each of its digits and two decimals at the least: `$0.50`, `$0.075`. */
export const rate = (dollars: number) => {
  // Six decimals holds any price for one million tokens, and cuts the tail of a float.
  const [whole, decimals] = dollars.toFixed(6).split(".");
  return `$${whole}.${decimals.replace(/0+$/, "").padEnd(2, "0")}`;
};

/** A price, written for a person: `$0.15 in · $0.50 out`, for one million tokens. */
export const priced = (price: ModelPrice) =>
  `${rate(price.input)} in · ${rate(price.output)} out`;
