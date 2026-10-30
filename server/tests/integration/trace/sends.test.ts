/**
 * A run on pi, sent to Langfuse: que's server on pi, with the deployment's
 * Langfuse settings and its commit, against a local server in the place of
 * Langfuse. The Langfuse SDK is the real one, and so is what it puts on the
 * wire. What the trace holds of the run is on-pi.test.ts's.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { serveOnPi, standIn, TRACES } from "./stand-in.js";

// The Langfuse SDK sends what it holds on a timer. Its own setting, in seconds.
process.env.LANGFUSE_FLUSH_INTERVAL = "0.1";

const langfuse = await standIn();
process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
process.env.LANGFUSE_BASE_URL = langfuse.url;
process.env.QUE_COMMIT = "acb4f7f72bf86a1e496b8162d5288a32d683354a";
const que = await serveOnPi();
after(async () => {
  await que.close();
  await langfuse.close();
});
await que.signIn("ana@example.com", "ana-key");

/** A run in which the model calls `till-count` for `item`, then answers "Well.". */
const counting = (item: string) => [
  fauxAssistantMessage([fauxToolCall("till-count", { item })], {
    stopReason: "toolUse",
  }),
  fauxAssistantMessage(fauxText("Well.")),
];

test("given a deployment's Langfuse keys, when a run ends, then its trace is sent to that Langfuse with those keys", async () => {
  const thread = await que.runOnPi("How many pens?", counting("pens"));
  await langfuse.traceOf(thread);
  const request = langfuse.sent.find((sent) => sent.spans.length > 0)!;
  assert.equal(request.path, TRACES);
  assert.equal(
    request.authorization,
    `Basic ${Buffer.from("pk-lf-test:sk-lf-test").toString("base64")}`,
  );
});

test("given the commit que runs from, when a run ends, then its trace's release is that commit", async () => {
  const thread = await que.runOnPi("How many inks?", counting("inks"));
  const run = (await langfuse.traceOf(thread)).find((s) => !s.parent)!;
  assert.equal(
    run.attributes["langfuse.release"],
    "acb4f7f72bf86a1e496b8162d5288a32d683354a",
  );
});
