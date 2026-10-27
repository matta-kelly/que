/**
 * A run, with a Langfuse that cannot be reached: a local server in the place
 * of Langfuse closes each connection with no answer.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { startTracing } from "../../../runtime/src/run/trace.js";
import { reportingAgent, runAsTheServer, standIn } from "./stand-in.js";

// The Langfuse SDK sends what it holds on a timer. Its own setting, in seconds.
process.env.LANGFUSE_FLUSH_INTERVAL = "0.1";

const langfuse = await standIn({ cut: true });
after(() => langfuse.close());

const traced = startTracing({
  publicKey: "pk-lf-test",
  secretKey: "sk-lf-test",
  baseUrl: langfuse.url,
});

test("a run ends with its answer when Langfuse cannot be reached, and the next run does too", async () => {
  const first = traced(reportingAgent(), { thread: "thread-a", agent: "chat" });
  assert.equal(await runAsTheServer(first, "thread-a"), "Well.");
  await langfuse.askedFor(1);
  const second = traced(reportingAgent(), {
    thread: "thread-b",
    agent: "chat",
  });
  assert.equal(await runAsTheServer(second, "thread-b"), "Well.");
});
