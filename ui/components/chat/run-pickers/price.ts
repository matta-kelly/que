// A model's price, as the model picker writes it. A stub: S6 moves `rate` and
// `priced` here from chat/usage/cost.ts.

import type { ModelPrice } from "../../../lib/que-api.ts";

/** One number of a price, with each of its digits and two decimals at the least: `$0.50`, `$0.075`. */
export const rate: (dollars: number) => string = () => "";

/** A price, written for a person: `$0.15 in · $0.50 out`, for one million tokens. */
export const priced: (price: ModelPrice) => string = () => "";
