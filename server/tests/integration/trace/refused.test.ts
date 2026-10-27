/**
 * A run, with a Langfuse that refuses what it is sent: a local server in the
 * place of Langfuse answers 401, as for a wrong key.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { startTracing } from "../../../runtime/src/run/trace.js";
import { reportingAgent, runAsTheServer, standIn } from "./stand-in.js";

// The Langfuse SDK sends what it holds on a timer. Its own setting, in seconds.
process.env.LANGFUSE_FLUSH_INTERVAL = "0.1";

const langfuse = await standIn({ status: 401 });
after(() => langfuse.close());

const traced = startTracing({
  publicKey: "pk-lf-test",
  secretKey: "sk-lf-wrong",
  baseUrl: langfuse.url,
});

test("a run ends with its answer when Langfuse refuses the trace, and the next run does too", async () => {
  const first = traced(reportingAgent(), { thread: "thread-a", agent: "chat" });
  assert.equal(await runAsTheServer(first, "thread-a"), "Well.");
  await langfuse.askedFor(1);
  const second = traced(reportingAgent(), {
    thread: "thread-b",
    agent: "chat",
  });
  assert.equal(await runAsTheServer(second, "thread-b"), "Well.");
  await langfuse.askedFor(2);
});
