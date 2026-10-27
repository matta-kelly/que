import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  createMiddleware,
  fakeModel,
  tool,
  type BaseMessage,
} from "langchain";
import * as z from "zod";
import { resolveLoop } from "@mku1tra/que-harness";
import { build } from "./build.js";

const ping = tool(async () => "pong", {
  name: "shop-ping",
  description: "Ping: answers pong.",
  schema: z.object({}),
});

const asking = (id: string) =>
  new AIMessage({
    content: "",
    tool_calls: [{ id, name: "shop-ping", args: {} }],
  });

/** One run on a chat as it was saved, with what the model was sent, and the chat after. */
async function run(chat: BaseMessage[]) {
  const model = fakeModel();
  model.respond(new AIMessage("Hi."));
  const sent: BaseMessage[][] = [];
  const graph = build(resolveLoop({ name: "loop" }), {
    model,
    window: 60_000,
    systemPrompt: "You help the sales team.",
    tools: [ping],
    middleware: [
      // Last in the list, so it sees a request as the model gets it.
      createMiddleware({
        name: "Seen",
        wrapModelCall: (request, handler) => {
          sent.push([...request.messages]);
          return handler(request);
        },
      }),
    ],
  });
  const { messages } = (await graph.invoke({ messages: chat })) as {
    messages: BaseMessage[];
  };
  return { sent: sent[0], saved: messages };
}

const shape = (messages: BaseMessage[]) =>
  messages.map((m) =>
    ToolMessage.isInstance(m) ? `tool:${m.tool_call_id}` : m.getType(),
  );

test("a tool call with no result gets one that says it was cancelled, in what the model is sent and in the saved chat", async () => {
  // A run that was stopped after the model asked for a tool: the call is saved, and its result is not.
  const { sent, saved } = await run([
    new HumanMessage("Ping the shop."),
    asking("stopped"),
    new HumanMessage("Never mind, say hi."),
  ]);
  assert.deepEqual(shape(sent), ["human", "ai", "tool:stopped", "human"]);
  const result = sent[2];
  assert.match(String(result.content), /cancelled/i);
  assert.deepEqual(shape(saved), [
    "human",
    "ai",
    "tool:stopped",
    "human",
    "ai",
  ]);
});

test("a chat with a result for each call is sent as it is", async () => {
  const chat = [
    new HumanMessage("Ping the shop."),
    asking("done"),
    new ToolMessage({ content: "pong", tool_call_id: "done" }),
    new AIMessage("The shop answered."),
    new HumanMessage("Say hi."),
  ];
  const { sent } = await run(chat);
  assert.deepEqual(shape(sent), ["human", "ai", "tool:done", "ai", "human"]);
  assert.equal(String(sent[2].content), "pong");
});
