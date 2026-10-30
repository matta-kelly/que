import { test } from "node:test";
import assert from "node:assert/strict";
import { replay, THREAD, type Sent } from "../fixtures/replay.js";
import { que, type Message } from "./que.js";

type RunBody = {
  threadId?: unknown;
  runId?: unknown;
  messages?: { id?: unknown; role?: unknown; content?: unknown }[];
  forwardedProps?: unknown;
};

/** What a run gave back: its messages, or the message of its fault. */
const outcome = (run: Promise<Message[]>) =>
  run.then(
    (messages) => ({ messages }),
    (error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }),
  );

/** The requests of the run that begins at `sent[at]`, and what que reads of its AG-UI RunAgentInput. */
const runOf = (sent: Sent[], at: number) => {
  const [create, run] = sent.slice(at, at + 2);
  const body = (run?.body ?? {}) as RunBody;
  const [message] = body.messages ?? [];
  return {
    requests: [
      `${create?.method} ${create?.path}`,
      `${run?.method} ${run?.path}`,
    ],
    threadId: body.threadId,
    runId: typeof body.runId === "string" && body.runId !== "",
    messages: (body.messages ?? []).map(({ role, content }) => ({
      role,
      content,
    })),
    messageId: typeof message?.id === "string" && message.id !== "",
    forwardedProps: body.forwardedProps,
  };
};

test("given a message and an agent, when the runner runs it, then que gets a new thread and, on it, AG-UI's RunAgentInput: the message as its one user message, the agent's name in its forwardedProps", async () => {
  const server = await replay();
  try {
    await que(server.url)
      .run("Where is the order of Ada?", "lean")
      .catch(() => undefined);
    const named = server.sent.length;
    await que(server.url)
      .run("What can you do?")
      .catch(() => undefined);
    const run = `POST /threads/${THREAD}/runs`;
    assert.deepEqual(
      { lean: runOf(server.sent, 0), none: runOf(server.sent, named) },
      {
        lean: {
          requests: ["POST /threads", run],
          threadId: THREAD,
          runId: true,
          messages: [{ role: "user", content: "Where is the order of Ada?" }],
          messageId: true,
          forwardedProps: { agent: "lean" },
        },
        // With no agent named, que runs the deployment's first.
        none: {
          requests: ["POST /threads", run],
          threadId: THREAD,
          runId: true,
          messages: [{ role: "user", content: "What can you do?" }],
          messageId: true,
          forwardedProps: {},
        },
      },
    );
  } finally {
    await server.close();
  }
});

test("given a run that calls a tool and then answers, when the runner runs it, then it gives back the messages of the run, in the runner's own form", async () => {
  const server = await replay();
  try {
    assert.deepEqual(
      await outcome(
        que(server.url).run("What can you do? Answer in one sentence.", "chat"),
      ),
      {
        messages: [
          {
            from: "user",
            text: "What can you do? Answer in one sentence.",
            calls: [],
          },
          {
            from: "agent",
            text: "",
            calls: [{ name: "open_plugin", args: { plugin: "shop" } }],
          },
          {
            from: "tool",
            tool: "open_plugin",
            text: "# Shop (`shop`)\nThe shop's order system.\n## Operations\n- find-orders: Find orders. Search orders by customer name.",
            calls: [],
          },
          {
            from: "agent",
            text: "I can find the shop's orders by customer name.",
            calls: [],
          },
        ],
      },
    );
  } finally {
    await server.close();
  }
});

test("given a run que ends with RUN_ERROR, when the runner runs it, then the run fails with the error's message", async () => {
  const server = await replay(() => true);
  try {
    assert.deepEqual(await outcome(que(server.url).run("What can you do?")), {
      error: "401 Unauthorized: the API key is not valid.",
    });
  } finally {
    await server.close();
  }
});

test("deletes the thread when the run finished, and when it did not", async () => {
  const finished = await replay();
  const failed = await replay(() => true);
  try {
    await que(finished.url)
      .run("What can you do?")
      .catch(() => undefined);
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
