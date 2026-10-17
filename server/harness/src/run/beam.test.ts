import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { concat } from "@langchain/core/utils/stream";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type AIMessageChunk,
} from "@langchain/core/messages";
import { ChatBeam } from "./beam.js";

/** A `fetch` that answers with one answer of Beam, saved, and keeps each request. */
function replaying(file: string) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const answer = readFileSync(join(import.meta.dirname, "fixtures", file));
  const fetch: typeof globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(answer, {
      headers: {
        "content-type": file.endsWith(".sse")
          ? "text/event-stream"
          : "application/json",
      },
    });
  };
  return { fetch, sent };
}

const MODEL = "Beam-1.0-501B-A23B";

test("ChatBeam keeps the reasoning_content of an answer on its message", async () => {
  const { fetch, sent } = replaying("beam-text.json");
  const answer = await new ChatBeam({
    model: MODEL,
    apiKey: "a-key",
    fetch,
  }).invoke("say hi");
  assert.equal(answer.content, "Hey! 👋 How's it going?");
  assert.equal(
    answer.additional_kwargs.reasoning_content,
    'The user just said "say hi" — a simple, casual greeting. I should respond in kind: friendly, brief, and warm. No need for anything elaborate. "Hi!" or "Hey!" works perfectly. Maybe add a touch of personality to keep it engaging.',
  );
  assert.equal(
    sent[0].url,
    "https://api.reflection.ai/openai/v1/chat/completions",
  );
  assert.equal(sent[0].body.model, MODEL);
});

test("ChatBeam keeps the reasoning_content of a streamed answer on its message, joined", async () => {
  const { fetch } = replaying("beam-stream-tool-call.sse");
  let answer: AIMessageChunk | undefined;
  for await (const chunk of await new ChatBeam({
    model: MODEL,
    apiKey: "a-key",
    fetch,
  }).stream("What time is it in Paris? Use the tool."))
    answer = answer ? concat(answer, chunk) : chunk;
  assert.equal(
    answer?.additional_kwargs.reasoning_content,
    'The user wants to know the current time in Paris, and explicitly asks to use the tool. I\'ll call get_time with city "Paris".',
  );
  assert.deepEqual(
    answer?.tool_calls?.map(({ name, args }) => ({ name, args })),
    [{ name: "get_time", args: { city: "Paris" } }],
  );
});

// A chat with two turns of the assistant that have no thinking of their own (from another
// model, or a summary), and one tool-call turn that has its own.
const chat = [
  new HumanMessage("hi"),
  new AIMessage("Hello! How can I help?"),
  new HumanMessage("What time is it in Paris? Use the tool."),
  new AIMessage({
    content: "",
    tool_calls: [{ id: "call-1", name: "get_time", args: { city: "Paris" } }],
    additional_kwargs: { reasoning_content: "I'll call get_time." },
  }),
  new ToolMessage({ content: "14:05", tool_call_id: "call-1" }),
  new AIMessage({
    content: "It is 14:05 in Paris.",
    additional_kwargs: { reasoning_content: "" },
  }),
  new HumanMessage("thanks"),
];
const sentThinking = (body: Record<string, unknown>) =>
  (body.messages as { reasoning_content?: string }[]).map(
    (message) => message.reasoning_content,
  );
const EACH_ASSISTANT_TURN = [
  undefined,
  " ",
  undefined,
  "I'll call get_time.",
  undefined,
  " ",
  undefined,
];

test("ChatBeam sends each assistant message back with its reasoning_content, and a space for one that has none", async () => {
  const called = replaying("beam-text.json");
  await new ChatBeam({
    model: MODEL,
    apiKey: "a-key",
    fetch: called.fetch,
  }).invoke(chat);
  assert.deepEqual(sentThinking(called.sent[0].body), EACH_ASSISTANT_TURN);

  const streamed = replaying("beam-stream-text.sse");
  // The request goes out with the first chunk.
  await (
    await new ChatBeam({
      model: MODEL,
      apiKey: "a-key",
      fetch: streamed.fetch,
    }).stream(chat)
  ).next();
  assert.deepEqual(sentThinking(streamed.sent[0].body), EACH_ASSISTANT_TURN);

  const evented = replaying("beam-stream-text.sse");
  await new ChatBeam({
    model: MODEL,
    apiKey: "a-key",
    fetch: evented.fetch,
  }).streamEvents(chat);
  assert.deepEqual(sentThinking(evented.sent[0].body), EACH_ASSISTANT_TURN);
});

test("ChatBeam sends the effort it is made with as reasoning_effort, and none when it is made with none", async () => {
  const most = replaying("beam-text.json");
  await new ChatBeam({
    model: MODEL,
    apiKey: "a-key",
    fetch: most.fetch,
    effort: "max",
  }).invoke("hi");
  assert.equal(most.sent[0].body.reasoning_effort, "max");

  const unset = replaying("beam-text.json");
  await new ChatBeam({
    model: MODEL,
    apiKey: "a-key",
    fetch: unset.fetch,
  }).invoke("hi");
  assert.equal(unset.sent[0].body.reasoning_effort, undefined);
});
