import { test } from "node:test";
import assert from "node:assert/strict";
import { chats } from "./chats.js";

const RUN = { accessContext: "threads.create_run" };

/** A run on a thread, as the server calls the factory for one. */
const run = (
  thread: string,
  { user = "user-7", agent = "chat", model = "small" } = {},
) => ({
  configurable: {
    langgraph_auth_user_id: user,
    thread_id: thread,
    agent,
    model,
  },
});

/** A build that gives a new agent each time, and keeps what it was asked for. */
function counting() {
  const asked: [string, unknown, unknown][] = [];
  const build = async (user: string, agent: unknown, model: unknown) => {
    asked.push([user, agent, model]);
    return { built: asked.length };
  };
  return { asked, build };
}

test("a second run on one thread, with the same user, agent and model, gets the agent built for the first", async () => {
  const { asked, build } = counting();
  const agentFor = chats(build);
  const first = await agentFor(run("thread-3"), RUN);
  const second = await agentFor(run("thread-3"), RUN);
  assert.equal(second, first);
  assert.deepEqual(asked, [["user-7", "chat", "small"]]);
});

test("a run on a new thread gets an agent built for it", async () => {
  const { asked, build } = counting();
  const agentFor = chats(build);
  const first = await agentFor(run("thread-3"), RUN);
  const second = await agentFor(run("thread-4"), RUN);
  assert.notEqual(second, first);
  assert.equal(asked.length, 2);
});

test("a run on one thread that names another agent, another model, or is another user's gets an agent built for it", async () => {
  const { asked, build } = counting();
  const agentFor = chats(build);
  await agentFor(run("thread-3"), RUN);
  await agentFor(run("thread-3", { agent: "lean" }), RUN);
  await agentFor(run("thread-3", { model: "large" }), RUN);
  await agentFor(run("thread-3", { user: "user-8" }), RUN);
  assert.deepEqual(asked, [
    ["user-7", "chat", "small"],
    ["user-7", "lean", "small"],
    ["user-7", "chat", "large"],
    ["user-8", "chat", "small"],
  ]);
});

test("a call that is not a run on a thread gets an agent built for it, and leaves none for the run after", async () => {
  const { asked, build } = counting();
  const agentFor = chats(build);
  const read = await agentFor(run("thread-3"), {
    accessContext: "threads.read",
  });
  const first = await agentFor(run("thread-3"), RUN);
  const schema = await agentFor(run("thread-3"), undefined);
  const threadless = await agentFor(
    { configurable: { langgraph_auth_user_id: "user-7" } },
    RUN,
  );
  assert.notEqual(first, read);
  assert.notEqual(schema, first);
  assert.notEqual(threadless, first);
  assert.equal(asked.length, 4);
});

test("a call with no user is built as the anonymous user", async () => {
  const { asked, build } = counting();
  const agentFor = chats(build);
  await agentFor(undefined, undefined);
  assert.deepEqual(asked, [["anonymous", undefined, undefined]]);
});

test("a chat that has not run while as many others as the bound ran gets an agent built for it again", async () => {
  const { asked, build } = counting();
  const agentFor = chats(build, 2);
  await agentFor(run("thread-1"), RUN);
  await agentFor(run("thread-2"), RUN);
  await agentFor(run("thread-1"), RUN);
  await agentFor(run("thread-3"), RUN);
  await agentFor(run("thread-1"), RUN);
  await agentFor(run("thread-2"), RUN);
  assert.equal(asked.length, 4);
});

test("a build that fails is not kept: the next run on that chat builds again", async () => {
  let builds = 0;
  const agentFor = chats(async () => {
    builds += 1;
    if (builds === 1) throw new Error("no agent");
    return { built: builds };
  });
  await assert.rejects(agentFor(run("thread-3"), RUN), /no agent/);
  assert.deepEqual(await agentFor(run("thread-3"), RUN), { built: 2 });
});
