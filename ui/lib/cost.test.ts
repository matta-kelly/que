import { test } from "node:test";
import assert from "node:assert/strict";
import { callCost, chatCost, money, replyCost } from "./cost.ts";

const human = { type: "human" };
const toolResult = { type: "tool" };
const ai = (
  input: number,
  output: number,
  more: { cached?: number; model?: string } = {},
) => ({
  type: "ai",
  usage_metadata: {
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
    input_token_details: { cache_read: more.cached ?? 0 },
  },
  response_metadata: more.model ? { que: { model: more.model } } : {},
});

// Dollars for one million tokens.
const prices = {
  big: { input: 3, output: 15, cachedInput: 0.3 },
  small: { input: 0.15, output: 0.5 },
  free: { input: 0, output: 0 },
};

// A cost is a sum of products of fractions, so it is near the decimal, not on it.
const near = (actual: number | undefined, expected: number) => {
  assert.equal(typeof actual, "number");
  assert.ok(
    Math.abs(actual! - expected) < 1e-12,
    `${actual} is not near ${expected}`,
  );
};

test("callCost prices cached tokens in apart from the rest, and tokens out", () => {
  // 600k in at $3, 400k cached at $0.30, 500k out at $15.
  near(
    callCost(
      {
        input_tokens: 1_000_000,
        output_tokens: 500_000,
        input_token_details: { cache_read: 400_000 },
      },
      prices.big,
    ),
    1.8 + 0.12 + 7.5,
  );
  // A reply of que: 613 in with 612 of them cached.
  near(
    callCost(
      {
        input_tokens: 613,
        output_tokens: 19,
        input_token_details: { cache_read: 612 },
      },
      prices.big,
    ),
    (1 * 3 + 612 * 0.3 + 19 * 15) / 1_000_000,
  );
  // Cached tokens at a price of zero are free, not at the price of tokens in.
  near(
    callCost(
      { input_tokens: 1_000_000, input_token_details: { cache_read: 400_000 } },
      { input: 3, output: 15, cachedInput: 0 },
    ),
    1.8,
  );
  assert.equal(callCost({}, prices.big), 0);
});

test("callCost prices cached tokens as tokens in when the price has no cachedInput", () => {
  near(
    callCost(
      {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        input_token_details: { cache_read: 400_000 },
      },
      prices.small,
    ),
    0.15 + 0.5,
  );
});

test("callCost never prices under zero tokens in", () => {
  // A provider that counts cached tokens apart from tokens in.
  near(
    callCost(
      {
        input_tokens: 100_000,
        output_tokens: 0,
        input_token_details: { cache_read: 1_000_000 },
      },
      prices.big,
    ),
    0.3,
  );
});

test("replyCost prices each call of a turn at the price of its own model", () => {
  near(
    replyCost(
      [
        human,
        ai(1_000_000, 100_000, { cached: 500_000, model: "big" }),
        toolResult,
        ai(2_000_000, 1_000_000, { model: "small" }),
      ],
      prices,
    ),
    1.5 + 0.15 + 1.5 + (0.3 + 0.5),
  );
  // A call with no usage yet adds nothing, stamp or none.
  near(
    replyCost([ai(1_000_000, 0, { model: "big" }), { type: "ai" }], prices),
    3,
  );
});

test("replyCost gives a cost of zero for a model with a price of zero", () => {
  assert.equal(replyCost([ai(600, 20, { model: "free" })], prices), 0);
});

test("replyCost gives nothing for a turn with a call that has no stamp, or no price", () => {
  assert.equal(replyCost([ai(600, 20)], prices), undefined);
  assert.equal(replyCost([ai(600, 20, { model: "gone" })], prices), undefined);
  // Never a part of the sum: one call with no price leaves the turn with no cost.
  assert.equal(
    replyCost([ai(600, 20, { model: "big" }), toolResult, ai(900, 40)], prices),
    undefined,
  );
  assert.equal(
    replyCost(
      [ai(600, 20, { model: "gone" }), ai(900, 40, { model: "big" })],
      prices,
    ),
    undefined,
  );
});

test("replyCost gives nothing for a turn with no model call that has usage", () => {
  assert.equal(replyCost([], prices), undefined);
  assert.equal(replyCost([human], prices), undefined);
  assert.equal(
    replyCost([human, { type: "ai" }, toolResult], prices),
    undefined,
  );
});

test("chatCost sums the turns that have a cost, and counts the ones that have none", () => {
  const chat = chatCost(
    [
      [human, ai(1_000_000, 0, { model: "big" })],
      [human, ai(600, 20)],
      [human, ai(0, 1_000_000, { model: "small" })],
      [human, ai(600, 20, { model: "big" }), ai(600, 20, { model: "gone" })],
      // A reply still on its way is in neither number.
      [human, { type: "ai" }],
      [human],
    ],
    prices,
  );
  near(chat?.total, 3 + 0.5);
  assert.equal(chat?.uncounted, 2);

  assert.deepEqual(
    chatCost([[human, ai(600, 20, { model: "free" })]], prices),
    {
      total: 0,
      uncounted: 0,
    },
  );
  assert.deepEqual(chatCost([[human, ai(600, 20)]], prices), {
    total: 0,
    uncounted: 1,
  });
});

test("chatCost gives nothing for a chat with no model call that has usage", () => {
  assert.equal(chatCost([], prices), undefined);
  assert.equal(chatCost([[human], [human, { type: "ai" }]], prices), undefined);
});

test("money writes a cost in five forms", () => {
  assert.equal(money(0), "$0.00");
  assert.equal(money(0.00003), "<$0.0001");
  assert.equal(money(0.0012), "$0.0012");
  assert.equal(money(0.012), "$0.012");
  assert.equal(money(0.5), "$0.500");
  assert.equal(money(1.23), "$1.23");
  assert.equal(money(1234.5), "$1234.50");
});

test("money takes the form of the side a limit is on", () => {
  assert.equal(money(0.0001), "$0.0001");
  assert.equal(money(0.01), "$0.010");
  assert.equal(money(1), "$1.00");
});

test("money writes a cost that rounds up to a limit in the form above it", () => {
  assert.equal(money(0.00994), "$0.0099");
  assert.equal(money(0.00996), "$0.010");
  assert.equal(money(0.9994), "$0.999");
  assert.equal(money(0.9996), "$1.00");
  // Under the least cost that is written, no rounding: it is not that cost.
  assert.equal(money(0.00009999), "<$0.0001");
});
