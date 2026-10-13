/**
 * The stand-in of the provider, asked the way que asks a model: through the
 * framework's package of the provider, as a stream.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMessageChunk, HumanMessage, initChatModel } from "langchain";
import { ASK, CALL, KEY, REPLY, USAGE, provider } from "./provider.js";

const MODEL = "fireworks:accounts/que/models/stand-in";

/** One message, sent as a stream. Gives back the chunks as one message, and what the stand-in kept. */
async function ask(text: string) {
  const standIn = await provider();
  process.env.FIREWORKS_BASE_URL = standIn.url;
  process.env.FIREWORKS_API_KEY = KEY;
  try {
    const model = await initChatModel(MODEL, { maxTokens: 100 });
    let answer: AIMessageChunk | undefined;
    for await (const chunk of await model.stream([new HumanMessage(text)]))
      answer = answer ? answer.concat(chunk) : chunk;
    return { answer: answer!, asked: standIn.asked };
  } finally {
    await standIn.close();
  }
}

test("the stand-in answers a chat request as a stream, with its fixed reply and token counts", async () => {
  const { answer, asked } = await ask("Say hi in one word.");
  assert.equal(answer.content, REPLY);
  assert.deepEqual(answer.tool_calls, []);
  assert.equal(answer.usage_metadata?.input_tokens, USAGE.prompt_tokens);
  assert.equal(answer.usage_metadata?.output_tokens, USAGE.completion_tokens);
  assert.deepEqual(asked, [
    { model: "accounts/que/models/stand-in", answer: "reply" },
  ]);
});

test("the stand-in answers with a call of the fixture operation when the message asks for one", async () => {
  const { answer, asked } = await ask(`${ASK} which books have "the"?`);
  assert.equal(answer.content, "");
  assert.deepEqual(
    answer.tool_calls?.map(({ name, args }) => ({ name, args })),
    [CALL],
  );
  assert.deepEqual(asked, [
    { model: "accounts/que/models/stand-in", answer: "call" },
  ]);
});
