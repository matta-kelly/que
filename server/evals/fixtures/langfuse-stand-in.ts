/**
 * A local server that stands in for Langfuse. It keeps one dataset and its
 * items, as Langfuse does, and keeps each request it was sent.
 *
 * Its answers are not taken from a live Langfuse: there was none to take them
 * from. Their shapes are the types of `@langfuse/core` 5.13.1 (`Dataset`,
 * `DatasetItem`, `PaginatedDatasetItems`, `DatasetRunItem`, `Projects`,
 * `IngestionResponse`).
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const PUBLIC_KEY = "pk-lf-test";
export const SECRET_KEY = "sk-lf-test";
export const PROJECT = "project-1";
export const DATASET = "dataset-1";

const AT = "2026-10-13T07:00:00.000Z";
const KEY = `Basic ${Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString("base64")}`;

export type Sent = { method: string; path: string; body: unknown };
/** An item as Langfuse holds it: the fields a request to make one has. */
export type Held = {
  id: string;
  status?: "ACTIVE" | "ARCHIVED";
  input?: unknown;
  expectedOutput?: unknown;
  metadata?: unknown;
};
/** One trace Langfuse was sent: the root span of one item of an experiment. */
export type Trace = {
  experiment: string;
  dataset: string;
  item: string;
  input: string;
  expected: string;
  output: unknown;
  metadata: Record<string, unknown>;
  level?: string;
  status?: string;
};

/** One score Langfuse was sent, with the experiment and the item of the trace it is on. */
export type Score = {
  experiment: string;
  item: string;
  name: string;
  dataType?: string;
  value: unknown;
  comment?: string;
};

type Attribute = { key: string; value: { stringValue?: string } };
type Otlp = {
  resourceSpans?: {
    scopeSpans?: {
      spans?: { traceId?: string; attributes?: Attribute[] }[];
    }[];
  }[];
};

const parsed = (text: string | undefined): unknown => {
  try {
    return JSON.parse(text ?? "null");
  } catch {
    return text;
  }
};

/**
 * `dataset` is the name of a dataset Langfuse has at the start, and `items`
 * what it holds. With `runs` false, Langfuse links no trace to a dataset run:
 * it answers 404 on the path the SDK asks a run on.
 */
export async function standIn(
  options: { dataset?: string; items?: Held[]; runs?: boolean } = {},
) {
  const sent: Sent[] = [];
  let dataset = options.dataset;
  const items = new Map((options.items ?? []).map((item) => [item.id, item]));
  const runs: string[] = [];

  const held = (item: Held) => ({
    status: "ACTIVE",
    sourceTraceId: null,
    sourceObservationId: null,
    datasetId: DATASET,
    datasetName: dataset,
    createdAt: AT,
    updatedAt: AT,
    mediaReferences: [],
    ...item,
  });
  const described = () => ({
    id: DATASET,
    name: dataset,
    description: null,
    metadata: null,
    inputSchema: null,
    expectedOutputSchema: null,
    projectId: PROJECT,
    createdAt: AT,
    updatedAt: AT,
  });

  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const body = (raw ? JSON.parse(raw) : undefined) as
        Record<string, unknown> | undefined;
      const method = request.method ?? "";
      const [path] = (request.url ?? "").split("?");
      sent.push({ method, path, body });
      const send = (status: number, answer: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(answer));
      };
      const to = `${method} ${path}`;

      if (to === "GET /api/public/health")
        return send(200, { status: "OK", version: "4.58.0" });
      if (request.headers.authorization !== KEY)
        return send(401, { message: "Invalid credentials" });

      if (method === "GET" && path.startsWith("/api/public/v2/datasets/")) {
        const name = decodeURIComponent(path.split("/").at(-1) ?? "");
        return name === dataset
          ? send(200, described())
          : send(404, { message: "Dataset not found" });
      }
      if (to === "POST /api/public/v2/datasets") {
        dataset = body?.name as string;
        return send(200, described());
      }
      if (to === "GET /api/public/dataset-items")
        return send(200, {
          data: [...items.values()].map(held),
          meta: {
            page: 1,
            limit: 50,
            totalItems: items.size,
            totalPages: 1,
          },
        });
      if (to === "POST /api/public/dataset-items") {
        const { datasetName, ...item } = body as Held & { datasetName: string };
        if (datasetName !== dataset)
          return send(404, { message: "Dataset not found" });
        items.set(item.id, { ...items.get(item.id), ...item });
        return send(200, held(items.get(item.id) as Held));
      }
      if (to === "POST /api/public/dataset-run-items") {
        if (options.runs === false) return send(404, { message: "Not Found" });
        const name = body?.runName as string;
        if (!runs.includes(name)) runs.push(name);
        return send(200, {
          id: `run-item-${sent.length}`,
          datasetRunId: `run-${runs.indexOf(name) + 1}`,
          datasetRunName: name,
          datasetItemId: body?.datasetItemId,
          traceId: body?.traceId,
          observationId: body?.observationId ?? null,
          createdAt: AT,
          updatedAt: AT,
        });
      }
      if (to === "GET /api/public/projects")
        return send(200, {
          data: [
            {
              id: PROJECT,
              name: "que-shop",
              organization: { id: "organization-1", name: "que" },
              metadata: {},
            },
          ],
        });
      if (to === "POST /api/public/otel/v1/traces") return send(200, {});
      // The SDK sends a score as one event of a batch.
      if (to === "POST /api/public/ingestion")
        return send(207, {
          successes: (body?.batch as { id: string }[]).map(({ id }) => ({
            id,
            status: 201,
          })),
          errors: [],
        });
      return send(404, { message: "Not Found" });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  const spans = () =>
    sent
      .filter(({ path }) => path === "/api/public/otel/v1/traces")
      .flatMap(({ body }) => (body as Otlp).resourceSpans ?? [])
      .flatMap((resource) => resource.scopeSpans ?? [])
      .flatMap((scope) => scope.spans ?? []);
  const attribute = (
    span: { attributes?: Attribute[] } | undefined,
    key: string,
  ) => span?.attributes?.find((a) => a.key === key)?.value.stringValue;

  return {
    url,
    sent,
    /** The link Langfuse gives to the nth dataset run it was asked for. */
    run: (n: number) =>
      `${url}/project/${PROJECT}/datasets/${DATASET}/runs/run-${n}`,
    /** The bodies of the requests that made, changed or archived an item, by id. */
    upserts: () =>
      sent
        .filter(
          ({ method, path }) =>
            method === "POST" && path === "/api/public/dataset-items",
        )
        .map(({ body }) => body as Held & { datasetName: string })
        .sort((a, b) => a.id.localeCompare(b.id)),
    /** The traces sent, by experiment and then by item. */
    traces: (): Trace[] =>
      spans()
        .map((span) => {
          const of = (key: string) => attribute(span, key);
          const level = of("langfuse.observation.level");
          const status = of("langfuse.observation.status_message");
          return {
            experiment: of("langfuse.experiment.name") ?? "",
            dataset: of("langfuse.experiment.dataset.id") ?? "",
            item: of("langfuse.experiment.item.id") ?? "",
            input: of("langfuse.observation.input") ?? "",
            expected: of("langfuse.experiment.item.expected_output") ?? "",
            output: parsed(of("langfuse.observation.output")),
            metadata: {
              ...(parsed(of("langfuse.experiment.item.metadata")) as object),
              ...(parsed(of("langfuse.experiment.metadata")) as object),
            },
            ...(level === undefined ? {} : { level }),
            ...(status === undefined ? {} : { status }),
          };
        })
        .sort((a, b) =>
          `${a.experiment} ${a.item}`.localeCompare(
            `${b.experiment} ${b.item}`,
          ),
        ),
    /** The scores sent, by the experiment and then the item of their trace. */
    scores: (): Score[] =>
      sent
        .filter(({ path }) => path === "/api/public/ingestion")
        .flatMap(
          ({ body }) =>
            (
              body as {
                batch: { type: string; body: Score & { traceId: string } }[];
              }
            ).batch,
        )
        .filter(({ type }) => type === "score-create")
        .map(({ body: { traceId, name, dataType, value, comment } }) => {
          const trace = spans().find((span) => span.traceId === traceId);
          return {
            experiment: attribute(trace, "langfuse.experiment.name") ?? "",
            item: attribute(trace, "langfuse.experiment.item.id") ?? "",
            name,
            dataType,
            value,
            comment,
          };
        })
        .sort((a, b) =>
          `${a.experiment} ${a.item}`.localeCompare(
            `${b.experiment} ${b.item}`,
          ),
        ),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
