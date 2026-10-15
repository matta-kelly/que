import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AIMessage,
  HumanMessage,
  fakeModel,
  tool,
  type BaseMessage,
} from "langchain";
import * as z from "zod";
import { resolveLoop } from "@que/core";
import { build } from "./build/build.js";
import { stamp } from "./stamp.js";

const ping = tool(async () => "pong", {
  name: "shop_ping",
  description: "Ping: answers pong.",
  schema: z.object({}),
});

/** One run, with the stamp of a model config named `small`. */
async function run(replies: AIMessage[]) {
  const model = fakeModel();
  for (const reply of replies) model.respond(reply);
  const graph = build(resolveLoop({ name: "loop" }), {
    model,
    window: 60_000,
    systemPrompt: "You help the sales team.",
    tools: [ping],
    middleware: [stamp("small")],
  });
  const { messages } = (await graph.invoke({
    messages: [new HumanMessage("Ping the shop.")],
  })) as { messages: BaseMessage[] };
  return messages.filter((m) => AIMessage.isInstance(m));
}

test("each reply of a run has the name of its model config", async () => {
  const replies = await run([
    new AIMessage({
      content: "",
      tool_calls: [{ id: "one", name: "shop_ping", args: {} }],
    }),
    new AIMessage("Pong."),
  ]);
  assert.equal(replies.length, 2);
  for (const reply of replies)
    assert.deepEqual(reply.response_metadata.que, { model: "small" });
});

test("the stamp keeps what the provider put in response_metadata", async () => {
  const [reply] = await run([
    new AIMessage({
      content: "Pong.",
      response_metadata: { finish_reason: "stop", usage: { total_tokens: 7 } },
    }),
  ]);
  assert.deepEqual(reply.response_metadata, {
    finish_reason: "stop",
    usage: { total_tokens: 7 },
    que: { model: "small" },
  });
});
