/**
 * A run on pi, sent to Langfuse: que's server on pi, with the deployment's
 * Langfuse settings pointing at a local server in the place of Langfuse. The
 * Langfuse SDK is the real one, and so is what it puts on the wire. The model
 * is pi-ai's scripted one, and the ops are the fixture plugins' till's and
 * warehouse's, the second through the domain whose op uses its reader role.
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

/**
 * The door's span of one op call: the span que's tracer opened, not pi's tool call of the same name. The login
 * the call ran on is on it as `que.login`: `own` for the user's own, a role's name for the role's, and none for
 * a domain op, which has no login of its own.
 */
const opSpan = (spans: Span[], name: string) =>
  spans.find((span) => span.scope === "que" && span.name === name);

/** The person a span names: the user's id, and their email. */
const personOf = (span: Span | undefined) => ({
  user: span?.attributes["user.id"],
  email: span?.attributes["user.email"],
});

test("given two users, each running the agent clerk on a thread of their own, when each run ends, then each run is one trace of its own, named after its agent config, whose root names its user, its thread and that config, and every span sent is in one of those two traces", async () => {
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

/**
 * A model call that has not answered when its run is stopped: `asked` resolves
 * when the model gets the request, and the call answers only once its signal
 * aborts (or after 10 s, when no stop comes), as a provider's call does.
 */
const unanswered = () => {
  let heard!: () => void;
  const asked = new Promise<void>((resolve) => (heard = resolve));
  const step = async (
    _context: unknown,
    options: { signal?: AbortSignal } | undefined,
  ) => {
    heard();
    await new Promise<void>((done) => {
      options?.signal?.addEventListener("abort", () => done(), { once: true });
      setTimeout(done, 10_000);
    });
    return fauxAssistantMessage(fauxText("It never gets here."));
  };
  return { asked, step };
};

test("given a run stopped while the model has not answered its request, when its trace is sent, then the trace still holds that request as a generation, with its input", async () => {
  const stopped = async (email: string, key: string, item: string) => {
    await que.signIn(email, key);
    const model = unanswered();
    const { thread, stream } = await que.startOnPi(`How many ${item}?`, [
      model.step,
    ]);
    await model.asked;
    const taken = await que.stopOnPi(thread);
    await stream;
    const generations = (await traceOf(thread)).filter(
      (span) => kind(span) === "generation",
    );
    return {
      taken,
      generations: generations.length,
      asked: input(generations[0])?.includes(`How many ${item}?`) ?? false,
    };
  };
  const expected = { taken: true, generations: 1, asked: true };
  assert.deepEqual(
    {
      pens: await stopped("ana@example.com", "ana-key", "pens"),
      ink: await stopped("bo@example.com", "bo-key", "ink"),
    },
    { pens: expected, ink: expected },
  );
});

test("given two users, each running an op of their own, when each run ends, then each trace's root and its op's span name the user by id and email", async () => {
  const traced = async (
    email: string,
    key: string,
    item: string,
    answer: string,
  ) => {
    const user = await que.signIn(email, key);
    const thread = await que.runOnPi(
      `How many ${item}?`,
      counting(item, `call-${item}`, answer),
    );
    const spans = await traceOf(thread);
    return {
      user,
      root: personOf(rootsOf(spans)[0]),
      op: personOf(opSpan(spans, "till-count")),
    };
  };
  const ana = await traced("ana@example.com", "ana-key", "pens", "Ten pens.");
  const bo = await traced(
    "bo@example.com",
    "bo-key",
    "ink",
    "Two pots of ink.",
  );
  assert.deepEqual(
    { ana: { root: ana.root, op: ana.op }, bo: { root: bo.root, op: bo.op } },
    {
      ana: {
        root: { user: ana.user, email: "ana@example.com" },
        op: { user: ana.user, email: "ana@example.com" },
      },
      bo: {
        root: { user: bo.user, email: "bo@example.com" },
        op: { user: bo.user, email: "bo@example.com" },
      },
    },
  );
});

test("given a run whose model calls the till's op and a domain op that uses the warehouse's reader role, when it ends, then each op's span says its login: own for the till, warehouse-reader for the warehouse, and none for the domain", async () => {
  await que.signIn("ana@example.com", "ana-key");
  // The role's login is one an admin sets, and every user who holds the role calls the op on it.
  await que.setLogin("ana@example.com", "warehouse", "warehouse-reader", {
    url: "https://warehouse.example.com",
  });
  const thread = await que.runOnPi("Count the pens and search the warehouse.", [
    fauxAssistantMessage(
      [
        fauxToolCall("till-count", { item: "pens" }, { id: "count-pens" }),
        fauxToolCall("roles-search", { code: "pen" }, { id: "search-pen" }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText("Done.")),
  ]);
  const spans = await traceOf(thread);
  const login = (name: string) => opSpan(spans, name)?.attributes["que.login"];
  assert.deepEqual(
    {
      till: login("till-count"),
      domain: login("roles-search"),
      role: login("warehouse-search"),
    },
    { till: "own", domain: undefined, role: "warehouse-reader" },
  );
});

test("given two users a granted domain gives the same role, when each calls the domain's op, then their calls are in two traces, each naming its own person and the role's login", async () => {
  const ana = await que.signIn("ana@example.com", "ana-key");
  await que.setLogin("ana@example.com", "warehouse", "warehouse-reader", {
    url: "https://warehouse.example.com",
  });
  const anaThread = await que.runOnPi("Search the warehouse for pens.", [
    fauxAssistantMessage(
      [fauxToolCall("roles-search", { code: "pens" }, { id: "ana-search" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText("Found them.")),
  ]);
  const bo = await que.signIn("bo@example.com", "bo-key");
  const boThread = await que.runOnPi("Search the warehouse for ink.", [
    fauxAssistantMessage(
      [fauxToolCall("roles-search", { code: "ink" }, { id: "bo-search" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText("Found it.")),
  ]);
  const anaTrace = await traceOf(anaThread);
  const boTrace = await traceOf(boThread);
  const who = (spans: Span[]) => {
    const op = opSpan(spans, "warehouse-search");
    return {
      root: personOf(rootsOf(spans)[0]),
      op: { ...personOf(op), login: op?.attributes["que.login"] },
    };
  };
  assert.notEqual(anaTrace[0]?.trace, boTrace[0]?.trace);
  assert.deepEqual(
    { ana: who(anaTrace), bo: who(boTrace) },
    {
      ana: {
        root: { user: ana, email: "ana@example.com" },
        op: {
          user: ana,
          email: "ana@example.com",
          login: "warehouse-reader",
        },
      },
      bo: {
        root: { user: bo, email: "bo@example.com" },
        op: {
          user: bo,
          email: "bo@example.com",
          login: "warehouse-reader",
        },
      },
    },
  );
});

test("given a run of the eval runner, tagged eval in its run input's forwardedProps, and a user's chat, when each run ends, then the eval run's trace root holds the tag eval, and the chat's holds no tag", async () => {
  await que.signIn("ana@example.com", "ana-key");
  const evalThread = await que.runOnPi(
    "How many pens?",
    counting("pens", "call-eval", "Ten pens."),
    { tags: ["eval"] },
  );
  const chatThread = await que.runOnPi(
    "How many pens?",
    counting("pens", "call-chat", "Ten pens."),
  );
  const tags = async (thread: string) =>
    rootsOf(await traceOf(thread)).map(
      (root) => root.attributes["langfuse.trace.tags"],
    );
  assert.deepEqual(
    { eval: await tags(evalThread), chat: await tags(chatThread) },
    { eval: ['["eval"]'], chat: [undefined] },
  );
});
