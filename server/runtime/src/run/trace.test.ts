import { test } from "node:test";
import assert from "node:assert/strict";
import { runOf, settingsFor, startTracing, tagsOf } from "./trace.js";

const set = {
  LANGFUSE_PUBLIC_KEY: "pk-lf-1",
  LANGFUSE_SECRET_KEY: "sk-lf-1",
  LANGFUSE_BASE_URL: "https://langfuse.example",
};

test("with no Langfuse setting, there is nothing to send to", () => {
  assert.equal(settingsFor({}), undefined);
  assert.equal(settingsFor({ MODEL: "provider:model" }), undefined);
});

test("with the two keys and the URL, the settings are those three", () => {
  assert.deepEqual(settingsFor(set), {
    publicKey: "pk-lf-1",
    secretKey: "sk-lf-1",
    baseUrl: "https://langfuse.example",
  });
});

test("a setting that is empty counts as not set", () => {
  assert.equal(
    settingsFor({
      LANGFUSE_PUBLIC_KEY: "",
      LANGFUSE_SECRET_KEY: "",
      LANGFUSE_BASE_URL: "",
    }),
    undefined,
  );
});

test("with one or two of the three, it stops, and the error names each one that is missing", () => {
  assert.throws(
    () => settingsFor({ LANGFUSE_PUBLIC_KEY: "pk-lf-1" }),
    /^Error: trace: missing LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL\./,
  );
  assert.throws(
    () => settingsFor({ ...set, LANGFUSE_BASE_URL: "" }),
    /^Error: trace: missing LANGFUSE_BASE_URL\./,
  );
  assert.throws(
    () => settingsFor({ ...set, LANGFUSE_SECRET_KEY: undefined }),
    /^Error: trace: missing LANGFUSE_SECRET_KEY\./,
  );
});

test("the commit que runs from is the release, and with none there is no release", () => {
  assert.equal(
    settingsFor({
      ...set,
      QUE_COMMIT: "acb4f7f72bf86a1e496b8162d5288a32d683354a",
    })?.release,
    "acb4f7f72bf86a1e496b8162d5288a32d683354a",
  );
  assert.equal("release" in settingsFor(set)!, false);
  assert.equal("release" in settingsFor({ ...set, QUE_COMMIT: "" })!, false);
});

test("a commit with no Langfuse setting is still nothing to send to", () => {
  assert.equal(
    settingsFor({ QUE_COMMIT: "acb4f7f72bf86a1e496b8162d5288a32d683354a" }),
    undefined,
  );
});

const run = {
  configurable: {
    langgraph_auth_user_id: "user-7",
    thread_id: "thread-3",
    run_id: "run-9",
    agent: "lean",
  },
};

test("a run is traced as its user, its thread and the agent config it ran under", () => {
  assert.deepEqual(
    runOf(run, { accessContext: "threads.create_run" }, { name: "lean" }),
    { user: "user-7", thread: "thread-3", agent: "lean" },
  );
});

test("a run with no user is traced with none", () => {
  assert.deepEqual(
    runOf(
      { configurable: { thread_id: "thread-3" } },
      { accessContext: "threads.create_run" },
      { name: "chat" },
    ),
    { thread: "thread-3", agent: "chat" },
  );
});

test("a call that is not a run is not traced", () => {
  assert.equal(
    runOf(run, { accessContext: "assistants.read" }, { name: "lean" }),
    undefined,
  );
  assert.equal(
    runOf(run, { accessContext: "threads.read" }, { name: "lean" }),
    undefined,
  );
  assert.equal(runOf(run, undefined, { name: "lean" }), undefined);
  assert.equal(runOf(undefined, undefined, { name: "lean" }), undefined);
});

/** An agent that would say so if a config were put on it. */
const agent = {
  withConfig(): never {
    throw new Error("a config was put on the agent");
  },
};

test("with nothing to send to, a run gets the agent as it was built", () => {
  const traced = startTracing(undefined);
  assert.equal(
    traced(agent, { user: "user-7", thread: "thread-3", agent: "lean" }),
    agent,
  );
});

test("given a run input's forwardedProps.tags, when que reads its tags, then it keeps only the ones it knows: eval, and no label a client makes up", () => {
  assert.deepEqual(
    {
      evalOnly: tagsOf({ tags: ["eval"] }),
      unknown: tagsOf({ tags: ["x"] }),
      mixed: tagsOf({ tags: ["eval", "x"] }),
      none: tagsOf({}),
      notAList: tagsOf({ tags: "eval" }),
      noProps: tagsOf(undefined),
    },
    {
      evalOnly: ["eval"],
      unknown: [],
      mixed: ["eval"],
      none: [],
      notAList: [],
      noProps: [],
    },
  );
});
