/**
 * What the trace tests share: a local HTTP server in the place of Langfuse,
 * an agent on a model that is not real, and a run made the way the LangGraph
 * server makes one. No Langfuse, no que and no model is called.
 */

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { AIMessage, HumanMessage, fakeModel, tool } from "langchain";
import * as z from "zod";
import { resolveLoop } from "@que/core";
import { build } from "../../../harness/src/run/build/build.js";

/** The path the Langfuse SDK posts spans to, under the base URL. */
export const TRACES = "/api/public/otel/v1/traces";

export type Sent = {
  path: string;
  authorization: string | undefined;
  spans: Span[];
};

export type Span = {
  trace: string;
  parent: string | undefined;
  name: string;
  start: bigint;
  end: bigint;
  attributes: Record<string, string>;
};

type Wire = {
  resourceSpans?: {
    scopeSpans?: {
      spans?: {
        traceId: string;
        parentSpanId?: string;
        name: string;
        startTimeUnixNano: string;
        endTimeUnixNano: string;
        attributes?: { key: string; value: Record<string, unknown> }[];
      }[];
    }[];
  }[];
};

const body = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
};

/** The spans of one OTLP request in JSON, with each attribute as text. */
const spansOf = (wire: Wire): Span[] =>
  (wire.resourceSpans ?? [])
    .flatMap((resource) => resource.scopeSpans ?? [])
    .flatMap((scope) => scope.spans ?? [])
    .map((span) => ({
      trace: span.traceId,
      parent: span.parentSpanId || undefined,
      name: span.name,
      start: BigInt(span.startTimeUnixNano),
      end: BigInt(span.endTimeUnixNano),
      attributes: Object.fromEntries(
        (span.attributes ?? []).map(({ key, value }) => [
          key,
          String(Object.values(value)[0]),
        ]),
      ),
    }));

/**
 * A server in the place of Langfuse. It keeps each request it gets, and
 * answers with `status`. With `cut`, it closes each connection with no answer.
 */
export async function standIn(how: { status?: number; cut?: boolean } = {}) {
  const sent: Sent[] = [];
  let asked = 0;
  const server = createServer(async (request, response) => {
    asked += 1;
    if (how.cut) return void request.socket.destroy();
    const text = await body(request);
    sent.push({
      path: request.url ?? "",
      authorization: request.headers.authorization,
      spans: request.url === TRACES ? spansOf(JSON.parse(text) as Wire) : [],
    });
    response.writeHead(how.status ?? 200, {
      "content-type": "application/json",
    });
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  /** Waits, up to `limit` ms, until `ready` gives a value. */
  const until = async <T>(
    what: string,
    ready: () => T | undefined,
    limit = 10_000,
  ): Promise<T> => {
    const end = Date.now() + limit;
    while (Date.now() < end) {
      const value = ready();
      if (value !== undefined) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`waited ${limit} ms for ${what}`);
  };

  return {
    url: `http://127.0.0.1:${port}`,
    sent,
    /** The spans of the trace of one thread, once its first span, the run itself, has come. */
    traceOf: (thread: string) =>
      until(`the trace of thread ${thread}`, () => {
        const spans = sent.flatMap((request) => request.spans);
        const root = spans.find(
          (span) => !span.parent && span.attributes["session.id"] === thread,
        );
        return root && spans.filter((span) => span.trace === root.trace);
      }),
    /** Resolves when the stand-in has been asked `times` times. */
    askedFor: (times: number) =>
      until(`request ${times} to the stand-in`, () =>
        asked >= times ? asked : undefined,
      ),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** An operation the agent can call. */
const report = tool(async ({ rows }) => `${rows} rows of the report`, {
  name: "shop_report",
  description: "Report: the rows of the sales report.",
  schema: z.object({ rows: z.number().describe("How many rows") }),
});

/** An agent that calls `shop_report` one time, then answers "Well.". */
export function reportingAgent() {
  const model = fakeModel();
  model.respond(
    new AIMessage({
      content: "",
      tool_calls: [{ id: "call-1", name: "shop_report", args: { rows: 2 } }],
    }),
  );
  model.respond(new AIMessage("Well."));
  return build(resolveLoop({ name: "test" }), {
    model,
    window: 100_000,
    systemPrompt: "You help the sales team.",
    tools: [report],
    middleware: [],
  });
}

/**
 * One run, made as the LangGraph server makes it: the server takes the inner
 * graph of what the factory hands back, and streams its events with the run's
 * own config and no callbacks (`@langchain/langgraph-api` 1.5.0,
 * `graph/load.utils.mjs` and `stream.mjs`). Gives back the text of the answer.
 */
export async function runAsTheServer(agent: unknown, thread: string) {
  const { graph } = agent as {
    graph: {
      streamEvents: (
        input: unknown,
        options: Record<string, unknown>,
      ) => AsyncIterable<{ event: string; data: { output?: unknown } }>;
    };
  };
  let answer: unknown;
  for await (const event of graph.streamEvents(
    { messages: [new HumanMessage("How did we sell?")] },
    {
      version: "v2",
      configurable: { thread_id: thread },
      metadata: {},
      streamMode: ["values"],
    },
  ))
    if (event.event === "on_chain_end") answer = event.data.output;
  const { messages } = answer as { messages: { content: unknown }[] };
  return String(messages.at(-1)?.content);
}
