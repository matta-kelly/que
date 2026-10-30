import { test } from "vitest";
import assert from "node:assert/strict";
import { priced, rate } from "./price.ts";

test("a price is written with each of its digits, and two decimals at the least", () => {
  // The price shown is the exact one the deployment gives.
  assert.equal(rate(0.15), "$0.15");
  assert.equal(rate(0.5), "$0.50");
  assert.equal(rate(3), "$3.00");
  assert.equal(rate(0.075), "$0.075");
  assert.equal(rate(0.0375), "$0.0375");
  assert.equal(rate(0.006), "$0.006");
  assert.equal(rate(0), "$0.00");
  // A sum of floats has a tail that is not a part of the price.
  assert.equal(rate(0.1 + 0.2), "$0.30");
});

test("a model's price is its price in and its price out, for one million tokens", () => {
  assert.equal(
    priced({ input: 0.075, output: 0.3, cachedInput: 0.006 }),
    "$0.075 in · $0.30 out",
  );
  assert.equal(priced({ input: 3, output: 15 }), "$3.00 in · $15.00 out");
});
