/**
 * A run, sent to Langfuse: against a local server in the place of Langfuse.
 * The Langfuse SDK is the real one, and so is what it puts on the wire.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { startTracing } from "../../../harness/src/run/trace.js";
import { TRACES, reportingAgent, runAsTheServer, standIn } from "./stand-in.js";

// The Langfuse SDK sends what it holds on a timer. Its own setting, in seconds.
process.env.LANGFUSE_FLUSH_INTERVAL = "0.1";

const langfuse = await standIn();
after(() => langfuse.close());

const traced = startTracing({
  publicKey: "pk-lf-test",
  secretKey: "sk-lf-test",
  baseUrl: langfuse.url,
  release: "acb4f7f72bf86a1e496b8162d5288a32d683354a",
});

test("a run is sent to the deployment's Langfuse, with its keys", async () => {
  const agent = traced(reportingAgent(), {
    thread: "thread-keys",
    agent: "chat",
  });
  assert.equal(await runAsTheServer(agent, "thread-keys"), "Well.");
  await langfuse.traceOf("thread-keys");
  const request = langfuse.sent.find((sent) => sent.spans.length > 0)!;
  assert.equal(request.path, TRACES);
  assert.equal(
    request.authorization,
    `Basic ${Buffer.from("pk-lf-test:sk-lf-test").toString("base64")}`,
  );
});

test("the trace says who the run was for, its thread, its agent config and the commit of que", async () => {
  const agent = traced(reportingAgent(), {
    user: "user-7",
    thread: "thread-says",
    agent: "lean",
  });
  await runAsTheServer(agent, "thread-says");
  const run = (await langfuse.traceOf("thread-says")).find((s) => !s.parent)!;
  assert.equal(run.attributes["user.id"], "user-7");
  assert.equal(run.attributes["session.id"], "thread-says");
  assert.equal(run.attributes["langfuse.trace.metadata.agent"], "lean");
  assert.equal(
    run.attributes["langfuse.release"],
    "acb4f7f72bf86a1e496b8162d5288a32d683354a",
  );
});

test("the trace holds each model call and each tool call, with its input, its output and its times", async () => {
  const agent = traced(reportingAgent(), {
    thread: "thread-steps",
    agent: "chat",
  });
  await runAsTheServer(agent, "thread-steps");
  const spans = await langfuse.traceOf("thread-steps");
  const kind = (span: { attributes: Record<string, string> }) =>
    span.attributes["langfuse.observation.type"];
  const models = spans.filter((span) => kind(span) === "generation");
  const tools = spans.filter((span) => kind(span) === "tool");
  assert.equal(models.length, 2);
  assert.match(
    models[0].attributes["langfuse.observation.input"],
    /How did we sell\?/,
  );
  assert.match(
    models[0].attributes["langfuse.observation.output"],
    /shop-report/,
  );
  assert.match(models[1].attributes["langfuse.observation.output"], /Well\./);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "shop-report");
  assert.match(
    tools[0].attributes["langfuse.observation.input"],
    /"rows":\s*2/,
  );
  assert.match(
    tools[0].attributes["langfuse.observation.output"],
    /2 rows of the report/,
  );
  assert.ok(models[0].start <= models[0].end);
  assert.ok(models[0].end <= tools[0].start);
  assert.ok(tools[0].start <= tools[0].end);
  assert.ok(tools[0].end <= models[1].start);
});

test("each run is a trace of its own", async () => {
  await runAsTheServer(
    traced(reportingAgent(), { thread: "thread-one", agent: "chat" }),
    "thread-one",
  );
  await runAsTheServer(
    traced(reportingAgent(), { thread: "thread-two", agent: "chat" }),
    "thread-two",
  );
  const one = await langfuse.traceOf("thread-one");
  const two = await langfuse.traceOf("thread-two");
  assert.notEqual(one[0].trace, two[0].trace);
});
