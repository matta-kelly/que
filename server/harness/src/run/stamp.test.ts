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
import { ENGINES, resolveLoop } from "@que/core";
import { build } from "./engine/index.js";
import { stamp } from "./stamp.js";

const ping = tool(async () => "pong", {
  name: "shop_ping",
  description: "Ping: answers pong.",
  schema: z.object({}),
});

/** One run on an engine, with the stamp of a model config named `small`. */
async function run(engine: (typeof ENGINES)[number], replies: AIMessage[]) {
  const model = fakeModel();
  for (const reply of replies) model.respond(reply);
  const graph = build(resolveLoop({ name: "loop", engine }), {
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

for (const engine of ENGINES) {
  test(`on ${engine}, each reply of a run has the name of its model config`, async () => {
    const replies = await run(engine, [
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
}

test("the stamp keeps what the provider put in response_metadata", async () => {
  const [reply] = await run("plain", [
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
