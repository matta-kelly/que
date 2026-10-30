/**
 * One process of que's server, for compaction-restart.test.ts: on the
 * database DATABASE_URL and the fixture deployment QUE_DEPLOYMENT
 * ("summary"), with pi-ai's scripted provider (`faux`) in the place of
 * Fireworks. Its mode is its first argument.
 *
 * - `interrupt`: runs the agents whole and late, each on a thread of its own,
 *   whose model calls ledger-report until the chat holds `whole` and `late`
 *   steps; at the next request of each, faux never answers. Once both wait,
 *   it writes "ready" and waits to be killed, so pi's storage holds each
 *   generation unfinished.
 * - `resume`: runs the agent early once, a run on another model, which
 *   starts pi's work, so pi resumes the generations the first process left.
 *   The resumed request of each was prepared before the restart, so faux
 *   answers it with one more report, and the request after it, prepared on
 *   this process, with an answer. It writes, as one line of JSON, each model
 *   request: its model, whether it is a summary's, and whether it holds the
 *   chat's first report.
 */

import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import type { Context, Model } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

/** The steps of each interrupted chat: reports of 1,000 tokens, as pi estimates them (3,500 characters). */
const STEPS = { whole: 30, late: 35 } as const;
const REPORT = 3_500;

const mode = process.argv[2];
const { app } = await import("../../serve.js");
const { models } = await import("./harness.js");

const faux = fauxProvider({
  provider: "fireworks",
  models: [
    { id: "small-model", contextWindow: 40_000 },
    { id: "wide-model", contextWindow: 100_000 },
    { id: "roomy-model", contextWindow: 40_000 },
    { id: "whole-model", contextWindow: 40_000 },
  ],
});
models.setProvider(faux.provider);

const server = serve({ fetch: app.fetch, port: 0 });
await new Promise((ready) => server.once("listening", ready));
const base = `http://localhost:${(server.address() as AddressInfo).port}`;
process.env.DEV_USER_EMAIL = "ana@example.com";

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** A run of the agent `agent` on a new thread: its response, which streams until the run ends. */
async function runOn(agent: string) {
  const made = await fetch(`${base}/threads`, json({ agent }));
  const threadId = ((await made.json()) as { id: string }).id;
  return fetch(
    `${base}/threads/${threadId}/runs`,
    json({
      threadId,
      runId: randomUUID(),
      messages: [{ id: randomUUID(), role: "user", content: "Report." }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
  );
}

const summarizing = (context: Context) =>
  JSON.stringify(context).includes("context summarization assistant");

if (mode === "interrupt") {
  const steps: Record<string, { mark: string; count: number; at: number }> = {
    "whole-model": { mark: "whole", count: STEPS.whole, at: 0 },
    "wide-model": { mark: "late", count: STEPS.late, at: 0 },
  };
  let waiting = 0;
  const reply = async (
    context: Context,
    _: unknown,
    __: unknown,
    model: Model<string>,
  ) => {
    if (summarizing(context))
      return fauxAssistantMessage(fauxText("SUMMARY OF THE OLD PART"));
    const chat = steps[model.id]!;
    const i = chat.at++;
    if (i >= chat.count) {
      if (++waiting === 2) process.stdout.write("ready\n");
      return new Promise<never>(() => {});
    }
    return fauxAssistantMessage(
      fauxToolCall(
        "ledger-report",
        { mark: `${chat.mark}-${i}`, size: REPORT },
        { id: `${chat.mark}${i}` },
      ),
      { stopReason: "toolUse" },
    );
  };
  faux.setResponses(Array.from({ length: 400 }, () => reply));
  // Each run streams until the process is killed.
  void runOn("whole")
    .then((r) => r.text())
    .catch(() => {});
  void runOn("late")
    .then((r) => r.text())
    .catch(() => {});
} else if (mode === "resume") {
  const requests: { model: string; summarizing: boolean; first: boolean }[] =
    [];
  const seen = new Set<string>();
  const reply = (
    context: Context,
    _: unknown,
    __: unknown,
    model: Model<string>,
  ) => {
    const summary = summarizing(context);
    const text = JSON.stringify(context.messages);
    requests.push({
      model: model.id,
      summarizing: summary,
      first: text.includes("whole-0 ") || text.includes("late-0 "),
    });
    if (summary)
      return fauxAssistantMessage(fauxText("SUMMARY OF THE OLD PART"));
    if (model.id === "small-model" || seen.has(model.id))
      return fauxAssistantMessage(fauxText("Done."));
    // The resumed request was prepared before the restart; the next one is prepared on this process's settings.
    seen.add(model.id);
    return fauxAssistantMessage(
      fauxToolCall(
        "ledger-report",
        { mark: `${model.id}-resumed`, size: REPORT },
        { id: `${model.id}-resumed` },
      ),
      { stopReason: "toolUse" },
    );
  };
  faux.setResponses(Array.from({ length: 50 }, () => reply));
  await (await runOn("early")).text();
  // The resumed generations answer once pi has resumed them.
  for (
    let waited = 0;
    waited < 20_000 &&
    ["whole-model", "wide-model"].some(
      (id) =>
        requests.filter((r) => r.model === id && !r.summarizing).length < 2,
    );
    waited += 50
  )
    await new Promise((later) => setTimeout(later, 50));
  process.stdout.write(`${JSON.stringify(requests)}\n`);
  process.exit(0);
}
