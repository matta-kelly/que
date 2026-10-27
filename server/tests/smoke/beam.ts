/**
 * The live smoke of Beam: does the Reflection API still answer que's chat
 * model for Beam as the recordings in chat-model/fixtures say. One
 * tool-call turn, then the turn after it with the tool's result, which Beam
 * refuses (400) when an assistant message goes back with no reasoning_content.
 * The chat before them has a plain turn of the assistant with no thinking of
 * its own. Both turns are streamed, as a run of the agent server streams.
 * The model config is the template's (templates/deployment/models/beam.ts),
 * effort high, and each request prints the effort and the usage it asks for,
 * and each answer the usage it gives.
 *
 * Large: it calls the real model, needs BEAM_API_KEY, and is no part of
 * `just check`. From server/, in the dev container:
 *
 *   npx tsx tests/smoke/beam.ts
 */

import { tool } from "langchain";
import { z } from "zod";
import {
  AIMessage,
  HumanMessage,
  type AIMessageChunk,
  type BaseMessage,
} from "@langchain/core/messages";
import { concat } from "@langchain/core/utils/stream";
import { ChatBeam, chatModel } from "../../chat-model/index.js";

const TURN_MS = 180_000;

// The request as it goes out: the client calls the global fetch.
const send = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  console.log(
    `request: reasoning_effort ${body.reasoning_effort}, stream_options ${JSON.stringify(body.stream_options)}`,
  );
  return send(url, init);
};

const getTime = tool(({ city }) => `It is 14:05 in ${city}.`, {
  name: "get_time",
  description: "The current time in a city",
  schema: z.object({ city: z.string() }),
});

const model = await chatModel({
  name: "beam",
  id: "beam:Beam-1.0-501B-A23B",
  window: 1_048_576,
  maxTokens: 131_072,
  price: { input: 0, output: 0 },
  effort: "high",
});
if (!(model instanceof ChatBeam))
  throw new Error("que's chat model for beam is not ChatBeam");
const withTools = model.bindTools([getTime]);

async function turn(messages: BaseMessage[]) {
  let answer: AIMessageChunk | undefined;
  for await (const chunk of await withTools.stream(messages, {
    signal: AbortSignal.timeout(TURN_MS),
  }))
    answer = answer ? concat(answer, chunk) : chunk;
  if (!answer) throw new Error("Beam gave no answer");
  console.log(`usage: ${JSON.stringify(answer.usage_metadata)}`);
  return answer;
}

const chat: BaseMessage[] = [
  new HumanMessage("hi"),
  new AIMessage("Hello! How can I help?"),
  new HumanMessage("What time is it in Paris? Use the get_time tool."),
];

const call = await turn(chat);
const [toolCall] = call.tool_calls ?? [];
if (!toolCall) throw new Error(`turn 1 called no tool: ${call.text}`);
const thinking = String(call.additional_kwargs.reasoning_content ?? "");
console.log(
  `turn 1: called ${toolCall.name} ${JSON.stringify(toolCall.args)}, with ${thinking.length} characters of reasoning_content`,
);

const result = await getTime.invoke(toolCall);
const reply = await turn([...chat, call, result]);
console.log(`turn 2, after the tool result: answered "${reply.text}"`);
