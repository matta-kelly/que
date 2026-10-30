/**
 * A run on pi, with a Langfuse that refuses what it is sent: a local server in the
 * place of Langfuse answers 401, as for a wrong key.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { serveOnPi, standIn } from "./stand-in.js";

// The Langfuse SDK sends what it holds on a timer. Its own setting, in seconds.
process.env.LANGFUSE_FLUSH_INTERVAL = "0.1";

const langfuse = await standIn({ status: 401 });
process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
process.env.LANGFUSE_SECRET_KEY = "sk-lf-wrong";
process.env.LANGFUSE_BASE_URL = langfuse.url;
const que = await serveOnPi();
after(async () => {
  await que.close();
  await langfuse.close();
});

/** One run in which the model calls `till-count` for `item`, then answers "Well.": the run's stream, once it ends. */
const run = async (item: string) =>
  (
    await que.startOnPi(`How many ${item}?`, [
      fauxAssistantMessage([fauxToolCall("till-count", { item })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage(fauxText("Well.")),
    ])
  ).stream;

test("a run ends with its answer when Langfuse refuses the trace, and the next run does too", async () => {
  await que.signIn("ana@example.com", "ana-key");
  const first = await run("pens");
  assert.match(first, /RUN_FINISHED/);
  assert.match(first, /Well\./);
  await langfuse.askedFor(1);
  const second = await run("inks");
  assert.match(second, /RUN_FINISHED/);
  assert.match(second, /Well\./);
  await langfuse.askedFor(2);
});
