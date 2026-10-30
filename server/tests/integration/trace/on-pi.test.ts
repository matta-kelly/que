/**
 * A run on pi, sent to Langfuse: que's server on pi, with the deployment's
 * Langfuse settings pointing at a local server in the place of Langfuse. The
 * Langfuse SDK is the real one, and so is what it puts on the wire. The model
 * is pi-ai's scripted one, and the op is the fixture plugin till's.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { serveOnPi, standIn, type Span } from "./stand-in.js";

// The Langfuse SDK sends what it holds on a timer. Its own setting, in seconds.
process.env.LANGFUSE_FLUSH_INTERVAL = "0.1";

const langfuse = await standIn();
process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
process.env.LANGFUSE_BASE_URL = langfuse.url;
const que = await serveOnPi();
after(async () => {
  await que.close();
  await langfuse.close();
});

/** Every span the stand-in got. */
const sent = () => langfuse.sent.flatMap((request) => request.spans);

/** The roots of a trace's spans: each span whose parent is not one of them. */
const rootsOf = (spans: Span[]) =>
  spans.filter((span) => !spans.some((other) => other.id === span.parent));

/**
 * The spans of the trace of `thread`: the trace with a root that names the
 * thread as its session. None when no such trace has come in 10 s.
 */
async function traceOf(thread: string): Promise<Span[]> {
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    const spans = sent();
    const root = spans.find(
      (span) =>
        span.attributes["session.id"] === thread &&
        rootsOf(spans.filter((s) => s.trace === span.trace)).includes(span),
    );
    if (root) {
      // What the processor still holds of the run comes on its next flush.
      await new Promise((settled) => setTimeout(settled, 500));
      return sent().filter((span) => span.trace === root.trace);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return [];
}

const kind = (span: Span) => span.attributes["langfuse.observation.type"];
const input = (span: Span | undefined) =>
  span?.attributes["langfuse.observation.input"];
const output = (span: Span | undefined) =>
  span?.attributes["langfuse.observation.output"];

/** The arguments `{ item }` in a span's JSON. */
const argsOf = (item: string) => new RegExp(`"item":\\s*"${item}"`);

/** A run in which the model calls `till-count` for `item` under `id`, then answers `answer`. */
const counting = (item: string, id: string, answer: string) => [
  fauxAssistantMessage([fauxToolCall("till-count", { item }, { id })], {
    stopReason: "toolUse",
  }),
  fauxAssistantMessage(fauxText(answer)),
];

test("given two users, each running the agent clerk on a thread of their own, when each run ends, then each run is one trace of its own, whose root names its user, its thread and its agent config, and every span sent is in one of those two traces", async () => {
  const ana = await que.signIn("ana@example.com", "ana-key");
  const anaThread = await que.runOnPi(
    "How many pens?",
    counting("pens", "call-ana", "Done."),
  );
  const bo = await que.signIn("bo@example.com", "bo-key");
  const boThread = await que.runOnPi(
    "How much ink?",
    counting("ink", "call-bo", "Counted."),
  );
  const anaTrace = await traceOf(anaThread);
  const boTrace = await traceOf(boThread);

  const said = (spans: Span[]) => {
    const roots = rootsOf(spans);
    return {
      roots: roots.length,
      user: roots[0]?.attributes["user.id"],
      session: roots[0]?.attributes["session.id"],
      agent: roots[0]?.attributes["langfuse.trace.metadata.agent"],
      // The trace is named after the run's agent, not after pi's first span.
      name: roots[0]?.attributes["langfuse.trace.name"],
      // The run's model calls and its tool call are in its trace, not in one of their own.
      generations: spans.filter((span) => kind(span) === "generation").length,
      tools: spans.filter((span) => kind(span) === "tool").length,
    };
  };
  assert.deepEqual(
    { ana: said(anaTrace), bo: said(boTrace) },
    {
      ana: {
        roots: 1,
        user: ana,
        session: anaThread,
        agent: "clerk",
        name: "clerk",
        generations: 2,
        tools: 1,
      },
      bo: {
        roots: 1,
        user: bo,
        session: boThread,
        agent: "clerk",
        name: "clerk",
        generations: 2,
        tools: 1,
      },
    },
  );
  assert.notEqual(anaTrace[0]?.trace, boTrace[0]?.trace);
  // No span of a run went out in a trace with no user and no thread: pi's own writes, or a span whose parent was not sent.
  assert.deepEqual(
    [...new Set(sent().map((span) => span.trace))].sort(),
    [anaTrace[0]?.trace, boTrace[0]?.trace].sort(),
  );
});

test("given a run in which the model calls till-count and then answers, when it ends, then its trace holds each request with its input and its answer, and the tool call with its arguments and its result, in the order they ran", async () => {
  const steps = async (
    email: string,
    key: string,
    item: string,
    answer: string,
  ) => {
    await que.signIn(email, key);
    const thread = await que.runOnPi(
      `How many ${item}?`,
      counting(item, `call-${item}`, answer),
    );
    const spans = await traceOf(thread);
    const generations = spans
      .filter((span) => kind(span) === "generation")
      .sort((a, b) => Number(a.start - b.start));
    const tools = spans.filter((span) => kind(span) === "tool");
    const [first, second] = generations;
    const [call] = tools;
    return {
      generations: generations.length,
      tools: tools.map((span) => span.name),
      // The first request holds the user's message, and its answer is the tool call.
      asked: input(first)?.includes(`How many ${item}?`),
      called: output(first)?.includes("till-count"),
      // The tool call's arguments, and its result: the connection the door asked for, as this user.
      args: argsOf(item).test(input(call) ?? ""),
      result: output(call)?.includes(`till:${key}`),
      // The second request holds the tool's result, and its answer is the text.
      fed: input(second)?.includes(`till:${key}`),
      answered: output(second)?.includes(answer),
      ordered:
        first !== undefined &&
        second !== undefined &&
        call !== undefined &&
        first.end <= call.start &&
        call.end <= second.start,
    };
  };
  const expected = {
    generations: 2,
    tools: ["till-count"],
    asked: true,
    called: true,
    args: true,
    result: true,
    fed: true,
    answered: true,
    ordered: true,
  };
  assert.deepEqual(
    {
      pens: await steps("ana@example.com", "ana-key", "pens", "Ten pens."),
      ink: await steps("bo@example.com", "bo-key", "ink", "Two pots of ink."),
    },
    { pens: expected, ink: expected },
  );
});

test("given a run in which the model calls till-tally twice in one round, and the op opens a span of the till's own, when it ends, then each till span is under the door's span of its own call, scope que, and that one under the tool call that made it", async () => {
  await que.signIn("ana@example.com", "ana-key");
  const thread = await que.runOnPi("Tally the ink and the nibs.", [
    fauxAssistantMessage(
      [
        fauxToolCall("till-tally", { item: "ink" }, { id: "tally-ink" }),
        fauxToolCall("till-tally", { item: "nibs" }, { id: "tally-nibs" }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText("Both are tallied.")),
  ]);
  const spans = await traceOf(thread);
  const byId = (id: string | undefined) => spans.find((span) => span.id === id);
  const nesting = (item: string) => {
    const till = spans.find((span) => span.attributes["till.item"] === item);
    const door = byId(till?.parent);
    const tool = byId(door?.parent);
    return {
      till: till?.name,
      door: door && { name: door.name, scope: door.scope },
      tool: tool && {
        kind: kind(tool),
        name: tool.name,
        // The tool call the door's span is under is the one for this item.
        own: argsOf(item).test(input(tool) ?? ""),
      },
    };
  };
  const expected = {
    till: "till-lookup",
    door: { name: "till-tally", scope: "que" },
    tool: { kind: "tool", name: "till-tally", own: true },
  };
  assert.deepEqual(
    { ink: nesting("ink"), nibs: nesting("nibs") },
    { ink: expected, nibs: expected },
  );
});
