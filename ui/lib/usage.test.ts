import { test } from "node:test";
import assert from "node:assert/strict";
import { contextUsed, replyUsage, short } from "./usage.ts";

const human = { type: "human" };
const toolResult = { type: "tool" };
const ai = (
  input: number,
  output: number,
  more: { cached?: number; reasoning?: number; model?: string } = {},
) => ({
  type: "ai",
  usage_metadata: {
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
    input_token_details: { cache_read: more.cached ?? 0 },
    output_token_details: { reasoning: more.reasoning ?? 0 },
  },
  response_metadata: more.model ? { que: { model: more.model } } : {},
});

test("contextUsed is tokens in plus out of the last reply with usage, and nothing with none", () => {
  assert.equal(contextUsed([]), undefined);
  assert.equal(contextUsed([human]), undefined);
  assert.equal(
    contextUsed([human, ai(600, 20), toolResult, ai(900, 40), human]),
    940,
  );
  // A reply still on its way has no usage yet: the one before it counts.
  assert.equal(contextUsed([human, ai(600, 20), human, { type: "ai" }]), 620);
});

test("replyUsage takes tokens in from the last call of a turn, and sums the rest", () => {
  assert.deepEqual(
    replyUsage([
      ai(600, 20, { cached: 500, reasoning: 5, model: "big" }),
      toolResult,
      ai(900, 40, { cached: 600, reasoning: 10, model: "big" }),
    ]),
    { input: 900, output: 60, cached: 1100, reasoning: 15, models: ["big"] },
  );
});

test("replyUsage names each model of a turn one time, in order", () => {
  assert.deepEqual(
    replyUsage([
      ai(1, 1, { model: "big" }),
      ai(1, 1, { model: "small" }),
      ai(1, 1, { model: "big" }),
    ])?.models,
    ["big", "small"],
  );
});

test("replyUsage gives no model for a reply with no stamp", () => {
  assert.deepEqual(replyUsage([ai(600, 20)]), {
    input: 600,
    output: 20,
    cached: 0,
    reasoning: 0,
    models: [],
  });
});

test("a reply with no usage adds nothing", () => {
  assert.equal(replyUsage([{ type: "ai" }, toolResult]), undefined);
  assert.deepEqual(replyUsage([ai(600, 20), { type: "ai" }])?.output, 20);
});

test("short writes a count in three forms", () => {
  assert.equal(short(0), "0");
  assert.equal(short(950), "950");
  assert.equal(short(1_000), "1k");
  assert.equal(short(2_940), "2.9k");
  assert.equal(short(12_345), "12k");
  assert.equal(short(512_000), "512k");
  assert.equal(short(999_900), "1M");
  assert.equal(short(1_040_000), "1M");
  assert.equal(short(1_200_000), "1.2M");
  assert.equal(short(12_500_000), "13M");
});
