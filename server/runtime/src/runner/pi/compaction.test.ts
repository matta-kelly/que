/**
 * Compaction on pi, from the agent's loop: a chat past `summarize.at` of the
 * model's window is summarized, and keeps about `summarize.keep` of it, as
 * the summary cases of the LangGraph path (run/build/build.test.ts) hold. The
 * repeat guard counts a call's streak only from the compaction's head on, as
 * LangGraph's summary removed the turns it replaced.
 *
 * Each case is a run through que's server listening on a port of its own:
 * POST /threads/:id/runs, on a thread that picks its agent. On a database of
 * its own (PGlite, served on a local port) and the fixture deployment
 * "summary", whose agents each have a model and a loop of their own, on the
 * plugin "ledger": its report is as long as it is asked for, so a chat fills
 * a known share of a window, and its entry below zero fails. In the place of
 * Fireworks, pi-ai's scripted provider (`faux`) answers under Fireworks'
 * provider id, the summary request too, so no model is called.
 *
 * Sizes are in tokens as pi estimates them (`estimateMessageTokens`), the
 * unit of pi's compaction settings.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { Context, Message } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { estimateMessageTokens } from "@earendil-works/pi-ai/utils/estimate";
import { deploymentRoot } from "../../../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../../tests/integration/mount/fixtures"),
  "summary",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;
const { app } = await import("../../serve.js");
const { models } = await import("./harness.js");

/** Each agent of the fixture: its model's window, and its loop's shares of it. */
const agents = {
  early: { model: "small-model", window: 40_000, at: 0.5, keep: 0.25 },
  late: { model: "wide-model", window: 100_000, at: 0.7, keep: 0.15 },
  roomy: { model: "roomy-model", window: 40_000, at: 0.5, keep: 0.4 },
  whole: { model: "whole-model", window: 40_000 },
} as const;

const faux = fauxProvider({
  provider: "fireworks",
  models: Object.values(agents).map(({ model, window }) => ({
    id: model,
    contextWindow: window,
  })),
});
models.setProvider(faux.provider);

const server = serve({ fetch: app.fetch, port: 0 });
await new Promise((ready) => server.once("listening", ready));
const base = `http://localhost:${(server.address() as AddressInfo).port}`;

after(async () => {
  await new Promise((closed) => server.close(closed));
  await database.stop();
  await db.close();
});

process.env.DEV_USER_EMAIL = "ana@example.com";

const SUMMARY = "SUMMARY OF THE OLD PART";

/** One response of the model: a report of `size` characters marked `mark`, a get of an entry that fails, or an answer. */
type Step =
  { report: string; size: number } | { fail: true } | { answer: string };

/** A report of `count` steps of `size` characters each, marked `<mark>-<i>`. */
const reports = (mark: string, count: number, size: number): Step[] =>
  Array.from({ length: count }, (_, i) => ({ report: `${mark}-${i}`, size }));

const fail: Step = { fail: true };

/** One model request as faux got it: the summary request, or one of the run's, with its messages. */
type Request = { summarizing: boolean; messages: Message[] };

const textOf = (message: Message) =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .map((block) =>
          block.type === "text"
            ? block.text
            : block.type === "toolCall"
              ? `${block.name}(${JSON.stringify(block.arguments)})`
              : "",
        )
        .join("");

const isSummary = (message: Message) =>
  message.role === "user" && textOf(message).includes(SUMMARY);

/** The tokens of `messages`, as pi estimates them, system messages left out. */
const tokensOf = (messages: readonly Message[]) =>
  messages
    .filter((m) => (m.role as string) !== "system")
    .reduce((sum, m) => sum + estimateMessageTokens(m), 0);

type Event = { type: string; [field: string]: unknown };

/** The AG-UI events of an SSE body, each `data:` line one event. */
async function eventsOf(response: Response): Promise<Event[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .map((frame) =>
      frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n"),
    )
    .filter(Boolean)
    .map((data) => JSON.parse(data) as Event);
}

/**
 * One run of the agent `agent`, on a thread of its own: the user asks, and
 * the model takes the steps of `script`, one response each, then answers
 * "Done.". The summary request gets SUMMARY. Each model request, each tool
 * result by its call's id (`s<i>`, the step's index), and the run's text.
 */
async function runOf(agent: keyof typeof agents, script: Step[]) {
  const requests: Request[] = [];
  let next = 0;
  const reply = (context: Context) => {
    const summarizing = JSON.stringify(context).includes(
      "context summarization assistant",
    );
    requests.push({ summarizing, messages: [...context.messages] });
    if (summarizing) return fauxAssistantMessage(fauxText(SUMMARY));
    const i = next++;
    const step = script[i] ?? { answer: "Done." };
    if ("answer" in step) return fauxAssistantMessage(fauxText(step.answer));
    return fauxAssistantMessage(
      "fail" in step
        ? fauxToolCall("ledger-get", { id: -1 }, { id: `s${i}` })
        : fauxToolCall(
            "ledger-report",
            { mark: step.report, size: step.size },
            { id: `s${i}` },
          ),
      { stopReason: "toolUse" },
    );
  };
  faux.setResponses(
    Array.from({ length: script.length * 2 + 10 }, () => reply),
  );

  const made = await fetch(`${base}/threads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent }),
  });
  const threadId = ((await made.json()) as { id: string }).id;
  const response = await fetch(`${base}/threads/${threadId}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      threadId,
      runId: randomUUID(),
      messages: [{ id: randomUUID(), role: "user", content: "Report." }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
  });
  const events = await eventsOf(response);
  const results = new Map<string, string>();
  for (const event of events)
    if (event.type === "TOOL_CALL_RESULT")
      results.set(
        String(event.toolCallId),
        typeof event.content === "string"
          ? event.content
          : JSON.stringify(event.content),
      );
  const text = events
    .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
    .map((e) => e.delta)
    .join("");
  const error = events.find((e) => e.type === "RUN_ERROR")?.message;
  return { requests, results, text, error };
}

/**
 * The run's requests, each with the size of the whole chat it stands for, as
 * if nothing were summarized: every message the run's requests have shown by
 * then, a summary left out. Whether it carries a summary, and whether a
 * summary was asked for before it.
 */
function grown(requests: Request[]) {
  const seen = new Map<string, number>();
  let asked = false;
  const out: {
    chat: number;
    summarized: boolean;
    askedBefore: boolean;
    messages: Message[];
  }[] = [];
  for (const request of requests) {
    if (request.summarizing) {
      asked = true;
      continue;
    }
    for (const message of request.messages) {
      if (isSummary(message) || (message.role as string) === "system") continue;
      const key = `${message.role}:${
        message.role === "toolResult" ? message.toolCallId : textOf(message)
      }`;
      if (!seen.has(key)) seen.set(key, estimateMessageTokens(message));
    }
    out.push({
      chat: [...seen.values()].reduce((a, b) => a + b, 0),
      summarized: request.messages.some(isSummary),
      askedBefore: asked,
      messages: request.messages,
    });
  }
  return out;
}

/** The characters of a report of about `tokens` tokens, as pi estimates them (3.5 characters a token). */
const sized = (tokens: number) => Math.round(tokens * 3.5);

/**
 * A run of the agent whose chat grows by about `step` tokens a response,
 * from nothing to 1.3 times its `summarize.at` of the window: it is not
 * summarized while the chat is under 0.8 of `at`, it is past 1.2 of it, and
 * the first request with the summary keeps about `keep` of the window: within
 * one step and a twentieth of it. The margins are pi's estimate against
 * faux's count of the usage it reports.
 */
async function compactsOn(agent: "early" | "late", step: number) {
  const { window, at, keep } = agents[agent];
  const count = Math.ceil((1.3 * at * window) / step);
  const { requests, text, error } = await runOf(
    agent,
    reports("report", count, sized(step)),
  );
  assert.equal(error, undefined);
  assert.equal(text, "Done.");
  const chat = grown(requests);

  // Under `at`: the chat as it is, and no summary asked for.
  const under = chat.filter((r) => r.chat < 0.8 * at * window);
  assert.ok(under.length > 0);
  for (const r of under) {
    assert.equal(
      r.summarized || r.askedBefore,
      false,
      `a chat of ${r.chat} tokens, under ${at} of ${window}, was summarized`,
    );
  }

  // Past it: each request has the summary in place of the old part.
  const over = chat.filter((r) => r.chat > 1.2 * at * window);
  assert.ok(over.length > 0);
  for (const r of over)
    assert.ok(
      r.summarized,
      `a chat of ${r.chat} tokens, past ${at} of ${window}, was not summarized`,
    );

  // The first request with the summary: the summary first, then about `keep` of the window, the newest part.
  const first = chat.find((r) => r.summarized)!;
  const from = first.messages.findIndex(isSummary);
  const kept = tokensOf(first.messages.slice(from + 1));
  const tolerance = step + 0.05 * keep * window;
  assert.ok(
    Math.abs(kept - keep * window) <= tolerance,
    `the summary kept ${kept} tokens, not about ${keep} of ${window} (${keep * window}, within ${tolerance})`,
  );
  // The old part is gone, the newest report is kept.
  assert.equal(
    first.messages.some((m) => textOf(m).includes("report-0 ")),
    false,
  );
  assert.ok(
    first.messages.slice(from + 1).some((m) => m.role === "toolResult"),
  );
}

const timeout = 60_000;

test(
  "given an agent that summarizes at half of a 40,000-token window and keeps a quarter, when its chat grows past half of the window, then it is summarized there and not before, and the summary keeps about a quarter of the window, the newest part",
  { timeout },
  () => compactsOn("early", 1_000),
);

test(
  "given an agent that summarizes at 0.7 of a 100,000-token window and keeps 0.15, when its chat grows past 0.7 of the window, then it is summarized there and not before, and the summary keeps about 0.15 of the window, the newest part",
  { timeout },
  () => compactsOn("late", 2_000),
);

test(
  "given an agent whose loop does not summarize, when its chat grows to 0.8 of a 40,000-token window, then no summary is asked for and every request has the whole chat",
  { timeout },
  async () => {
    const { window } = agents.whole;
    const step = 1_000;
    const { requests, text, error } = await runOf(
      "whole",
      reports("report", Math.ceil((0.8 * window) / step), sized(step)),
    );
    assert.equal(error, undefined);
    assert.equal(text, "Done.");
    assert.equal(
      requests.filter((r) => r.summarizing).length,
      0,
      "a summary was asked for",
    );
    const last = grown(requests).at(-1)!;
    assert.ok(last.chat > 0.75 * window);
    assert.ok(last.messages.some((m) => textOf(m).includes("report-0 ")));
  },
);

const stopped = /failed 3 times in a row/;

test(
  "given a call that failed twice before a summary's head, when it fails again after it, then the streak counts from the head: the third and fourth failures are errors and the fifth stops the run; and given two failures the summary keeps, when the call fails a third time, then the run stops",
  { timeout },
  async () => {
    const { window, at } = agents.roomy;
    const step = 1_000;
    const fill = Math.ceil((1.3 * at * window) / step);

    // Two failures, then a chat past `at`, so the summary's head is after them; then four more.
    const before = await runOf("roomy", [
      fail,
      fail,
      ...reports("report", fill, sized(step)),
      fail,
      fail,
      fail,
      fail,
    ]);
    const third = `s${fill + 2}`;
    const asked = grown(before.requests);
    // The model was asked for the third failure on a summarized chat that no longer holds the first two.
    const atThird = asked[fill + 2]!;
    assert.ok(atThird.summarized, "no summary before the third failure");
    assert.equal(
      atThird.messages.some(
        (m) => m.role === "toolResult" && m.toolCallId === "s0",
      ),
      false,
    );
    assert.doesNotMatch(
      String(before.results.get(third)),
      stopped,
      "the failures the summary replaced counted",
    );
    assert.match(String(before.results.get(third)), /no such entry/);
    assert.doesNotMatch(String(before.results.get(`s${fill + 3}`)), stopped);
    assert.match(String(before.results.get(`s${fill + 4}`)), stopped);
    assert.equal(before.results.has(`s${fill + 5}`), false);

    // Fourteen steps, two failures, then one report of 12,000 tokens past `at`: a summary that keeps 0.4 of the window keeps both failures.
    const kept = await runOf("roomy", [
      ...reports("report", 14, sized(step)),
      fail,
      fail,
      { report: "big", size: sized(12_000) },
      fail,
    ]);
    const keptAsked = grown(kept.requests);
    const atLast = keptAsked[17]!;
    assert.ok(atLast.summarized, "no summary before the third failure");
    assert.ok(
      atLast.messages.some(
        (m) => m.role === "toolResult" && m.toolCallId === "s14",
      ),
      "the summary did not keep the first failure",
    );
    assert.match(String(kept.results.get("s17")), stopped);
  },
);
