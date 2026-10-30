/**
 * What the trace tests share: a local HTTP server in the place of Langfuse,
 * and que's server on pi with a scripted model. No Langfuse, no que and no
 * model is called.
 *
 * que's server here runs on PGlite, served on a local port: one session, which
 * the socket server shares across connections. A query of another connection
 * can be split across a commit of pi's storage and fail, so a test whose reads
 * overlap a commit needs real Postgres (README, Commands).
 */

import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { deploymentRoot } from "../../deployment-root.js";

/** The path the Langfuse SDK posts spans to, under the base URL. */
export const TRACES = "/api/public/otel/v1/traces";

export type Sent = {
  path: string;
  authorization: string | undefined;
  spans: Span[];
};

export type Span = {
  trace: string;
  id: string;
  parent: string | undefined;
  /** The name of the tracer that opened it: its instrumentation scope. */
  scope: string;
  name: string;
  start: bigint;
  end: bigint;
  attributes: Record<string, string>;
};

type Wire = {
  resourceSpans?: {
    scopeSpans?: {
      scope?: { name?: string };
      spans?: {
        traceId: string;
        spanId: string;
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

type Value = Record<string, unknown> & { arrayValue?: { values?: Value[] } };

/** An attribute's value as text: a list as the JSON of its values. */
const textOf = (value: Value): string =>
  value.arrayValue
    ? JSON.stringify(
        (value.arrayValue.values ?? []).map((item) => Object.values(item)[0]),
      )
    : String(Object.values(value)[0]);

/** The spans of one OTLP request in JSON, with each attribute as text. */
const spansOf = (wire: Wire): Span[] =>
  (wire.resourceSpans ?? [])
    .flatMap((resource) => resource.scopeSpans ?? [])
    .flatMap((scope) =>
      (scope.spans ?? []).map((span) => ({ span, scope: scope.scope?.name })),
    )
    .map(({ span, scope }) => ({
      trace: span.traceId,
      id: span.spanId,
      parent: span.parentSpanId || undefined,
      scope: scope ?? "",
      name: span.name,
      start: BigInt(span.startTimeUnixNano),
      end: BigInt(span.endTimeUnixNano),
      attributes: Object.fromEntries(
        (span.attributes ?? []).map(({ key, value }) => [key, textOf(value)]),
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

/**
 * que's server on pi, listening on a port of its own, as tool-calls.test.ts
 * starts it: on a database of its own (PGlite, served on a local port) and the
 * fixture deployment "tools", whose one agent, "clerk", uses the plugin
 * "till". In the place of Fireworks, pi-ai's scripted provider (`faux`)
 * answers under Fireworks' provider id. The server reads the environment when
 * it is imported, so a test sets its trace settings before it calls this.
 */
export async function serveOnPi() {
  const db = await PGlite.create();
  const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
  await database.start();
  process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
  process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
  process.env.QUE_DEPLOYMENT = deploymentRoot(
    join(import.meta.dirname, "../mount/fixtures"),
    "tools",
  );
  delete process.env.DEV_USER_EMAIL;
  delete process.env.DEV_USER_NAME;
  const { app } = await import("../../../runtime/src/serve.js");
  const { models } = await import("../../../runtime/src/runner/pi/harness.js");
  const faux = fauxProvider({
    provider: "fireworks",
    models: [{ id: "small-model", contextWindow: 64_000 }],
  });
  models.setProvider(faux.provider);

  const server = serve({ fetch: app.fetch, port: 0 });
  await new Promise((ready) => server.once("listening", ready));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;

  /** Signs in as `email`, as @que/identity reads it, and saves their till key: their user id. */
  const signIn = async (email: string, key: string) => {
    process.env.DEV_USER_EMAIL = email;
    const saved = await fetch(`${base}/que/connections/till`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { key } }),
    });
    if (saved.status !== 200)
      throw new Error(`the till key was not saved: ${await saved.text()}`);
    const me = await fetch(`${base}/que/me`);
    return ((await me.json()) as { id: string }).id;
  };

  /**
   * One message on a new thread of the signed-in user, answered as `responses`
   * script, with the run input's `forwardedProps`: the thread, and the run's
   * stream as text once it has ended.
   */
  const startOnPi = async (
    content: string,
    responses: Parameters<typeof faux.setResponses>[0],
    forwardedProps: Record<string, unknown> = {},
  ) => {
    const made = await fetch(`${base}/threads`, { method: "POST" });
    const threadId = ((await made.json()) as { id: string }).id;
    faux.setResponses(responses);
    const response = fetch(`${base}/threads/${threadId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId,
        runId: randomUUID(),
        messages: [{ id: randomUUID(), role: "user", content }],
        tools: [],
        context: [],
        state: {},
        forwardedProps,
      }),
    });
    return { thread: threadId, stream: response.then((r) => r.text()) };
  };

  /**
   * One message on a new thread of the signed-in user, answered as `responses`
   * script, with the run input's `forwardedProps`: the thread, once the run's
   * stream has ended.
   */
  const runOnPi = async (
    content: string,
    responses: Parameters<typeof faux.setResponses>[0],
    forwardedProps: Record<string, unknown> = {},
  ) => {
    const { thread, stream } = await startOnPi(
      content,
      responses,
      forwardedProps,
    );
    const text = await stream;
    if (!text.includes("RUN_FINISHED"))
      throw new Error(`the run did not finish: ${text}`);
    return thread;
  };

  /** Stops the thread's run, through POST /threads/:id/stop: whether the route took the stop. */
  const stopOnPi = async (thread: string) =>
    (await fetch(`${base}/threads/${thread}/stop`, { method: "POST" })).ok;

  return {
    signIn,
    startOnPi,
    runOnPi,
    stopOnPi,
    close: async () => {
      await new Promise((closed) => server.close(closed));
      await database.stop();
      await db.close();
    },
  };
}
