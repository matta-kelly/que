import { test } from "node:test";
import assert from "node:assert/strict";
import { replay, THREAD } from "../fixtures/replay.js";
import { que, text } from "./que.js";

type RunBody = { assistant_id: string; input: unknown; config?: unknown };

test("sends the input as one user message on a new thread, with the agent's name in the configurable", async () => {
  const server = await replay();
  try {
    await que(server.url).run("Where is the order of Ada?", "lean");
    const [create, wait] = server.sent;
    assert.equal(`${create.method} ${create.path}`, "POST /threads");
    assert.equal(
      `${wait.method} ${wait.path}`,
      `POST /threads/${THREAD}/runs/wait`,
    );
    const body = wait.body as RunBody;
    assert.equal(body.assistant_id, "agent");
    assert.deepEqual(body.input, {
      messages: [{ role: "user", content: "Where is the order of Ada?" }],
    });
    assert.deepEqual(body.config, { configurable: { agent: "lean" } });
  } finally {
    await server.close();
  }
});

test("with no agent, sends no configurable", async () => {
  const server = await replay();
  try {
    await que(server.url).run("Where is the order of Ada?");
    const body = server.sent[1].body as RunBody;
    assert.equal(body.config, undefined);
  } finally {
    await server.close();
  }
});

test("gives back the messages of the run, in que's own form", async () => {
  const server = await replay();
  try {
    assert.deepEqual(await que(server.url).run("What can you do?", "chat"), [
      {
        from: "user",
        text: "What can you do? Answer in one sentence.",
        calls: [],
      },
      {
        from: "agent",
        text: "",
        calls: [{ name: "open_package", args: { package: "shop" } }],
      },
      {
        from: "tool",
        tool: "open_package",
        text: "# Shop (`shop`)\nThe shop's order system.\n## Operations\n- findOrders: Find orders. Search orders by customer name.",
        calls: [],
      },
      {
        from: "agent",
        text: "I can find the shop's orders by customer name.",
        calls: [],
      },
    ]);
  } finally {
    await server.close();
  }
});

test("deletes the thread when the run finished, and when it did not", async () => {
  const finished = await replay();
  const failed = await replay(() => true);
  try {
    await que(finished.url).run("What can you do?");
    await que(failed.url)
      .run("What can you do?")
      .catch(() => undefined);
    const last = (sent: { method: string; path: string }[]) =>
      `${sent[sent.length - 1].method} ${sent[sent.length - 1].path}`;
    assert.equal(last(finished.sent), `DELETE /threads/${THREAD}`);
    assert.equal(last(failed.sent), `DELETE /threads/${THREAD}`);
  } finally {
    await finished.close();
    await failed.close();
  }
});

test("gives back the error of a run that did not finish", async () => {
  const server = await replay(() => true);
  try {
    await assert.rejects(
      que(server.url).run("What can you do?", "nope"),
      (error: Error) => {
        assert.equal(error.message, 'no agent "nope". Agents: chat');
        return true;
      },
    );
  } finally {
    await server.close();
  }
});

test("says que is up when it answers, and not up when nothing does", async () => {
  const server = await replay();
  try {
    assert.equal(await que(server.url).up(), true);
  } finally {
    await server.close();
  }
  assert.equal(await que(server.url).up(), false);
});

test("the text of a content in parts is its text parts, joined", () => {
  assert.equal(
    text([
      { type: "text", text: "Ada has " },
      { type: "image_url", image_url: "data:..." },
      { type: "text", text: "one open order." },
    ]),
    "Ada has one open order.",
  );
});
