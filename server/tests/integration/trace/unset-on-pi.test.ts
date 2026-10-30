/**
 * A run on pi, with no Langfuse settings: que's server on pi, with none of the
 * three in its environment. OpenTelemetry's own exporter setting points at a
 * local server, as a collector would be: an SDK started with no span processor
 * of que's sends there by default, so what it gets is what was sent.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { serveOnPi, standIn } from "./stand-in.js";

const collector = await standIn();
delete process.env.LANGFUSE_PUBLIC_KEY;
delete process.env.LANGFUSE_SECRET_KEY;
delete process.env.LANGFUSE_BASE_URL;
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = collector.url;
// OpenTelemetry's batch processor sends on this delay, in ms.
process.env.OTEL_BSP_SCHEDULE_DELAY = "100";
const que = await serveOnPi();
after(async () => {
  await que.close();
  await collector.close();
});

test("given no Langfuse settings, when two runs with a tool call end, then nothing is sent", async () => {
  await que.signIn("ana@example.com", "ana-key");
  for (const [item, tallied] of [
    ["ink", "tally-ink"],
    ["nibs", "tally-nibs"],
  ])
    await que.runOnPi(`Tally the ${item}.`, [
      fauxAssistantMessage(
        [fauxToolCall("till-tally", { item }, { id: tallied })],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(fauxText("Tallied.")),
    ]);
  // Long past the delay on which a processor would send.
  await new Promise((waited) => setTimeout(waited, 1_500));
  assert.deepEqual(
    collector.sent.map((request) => request.path),
    [],
  );
});
