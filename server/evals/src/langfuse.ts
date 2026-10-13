/**
 * Langfuse, where the runs are kept: the cases mirrored into one dataset, and
 * each experiment sent as one run on it. The one file that knows the Langfuse
 * SDK and OpenTelemetry. What it takes and hands back is in the runner's own
 * form.
 */

import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { updateActiveObservation } from "@langfuse/tracing";
import { context, propagation, trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { isDeepStrictEqual } from "node:util";
import type { Experiment, Item, Sending, Sent } from "./experiment.js";

export type Settings = {
  url: string;
  publicKey: string;
  secretKey: string;
  /** The commit of que the runs were made on. */
  commit: string;
};
export type Langfuse = {
  up(): Promise<boolean>;
  /** Mirror the dataset, then send each experiment, one after the other. */
  send(sending: Sending): Promise<Sent[]>;
};

type Env = Record<string, string | undefined>;

// In the order the error names them.
const STORE = [
  ["LANGFUSE_BASE_URL", "url"],
  ["LANGFUSE_PUBLIC_KEY", "publicKey"],
  ["LANGFUSE_SECRET_KEY", "secretKey"],
] as const;
const SETTINGS = [...STORE, ["QUE_COMMIT", "commit"]] as const;

/**
 * The Langfuse settings of the environment, or undefined with none of the
 * three of the store. A store set in part is a mistake in the `.env`, and
 * throws. So does a store with no commit: a run in Langfuse is named by it.
 */
export function settings(env: Env): Settings | undefined {
  if (STORE.every(([name]) => !env[name])) return undefined;
  const missing = SETTINGS.filter(([name]) => !env[name]).map(([name]) => name);
  if (missing.length)
    throw new Error(
      `eval: Langfuse is set in part. Missing: ${missing.join(", ")}`,
    );
  return Object.fromEntries(
    SETTINGS.map(([name, key]) => [key, env[name]]),
  ) as Settings;
}

/** The items of a dataset, as the SDK gives them. */
type Held = Awaited<ReturnType<LangfuseClient["dataset"]["get"]>>["items"];

const same = (held: Held[number], item: Item) =>
  held.status === "ACTIVE" &&
  isDeepStrictEqual(
    [held.input, held.expectedOutput, held.metadata],
    [item.input, item.expected, item.metadata],
  );

/**
 * Makes the dataset in Langfuse hold the cases, and gives back its items. Each
 * change to an item makes a new version of the dataset, so only what differs
 * is sent. A case that is gone is archived: its old runs keep their item.
 */
async function mirror(
  client: LangfuseClient,
  { name, items }: Sending["dataset"],
): Promise<Held> {
  const held = await client.dataset.get(name).then(
    (dataset) => dataset.items,
    async (error: { statusCode?: number }): Promise<Held> => {
      if (error.statusCode !== 404) throw error;
      await client.api.datasets.create({ name });
      return [];
    },
  );
  const byId = new Map(held.map((item) => [item.id, item]));
  const wanted = new Set(items.map((item) => item.id));
  let changed = false;
  const put = async (
    item: Pick<
      Held[number],
      "id" | "input" | "expectedOutput" | "metadata" | "status"
    >,
  ) => {
    changed = true;
    await client.api.datasetItems.create({ datasetName: name, ...item });
  };

  for (const item of items) {
    const has = byId.get(item.id);
    if (!has || !same(has, item))
      await put({
        id: item.id,
        input: item.input,
        expectedOutput: item.expected,
        metadata: item.metadata,
        status: "ACTIVE",
      });
  }
  // The item goes whole, so the archive changes its status and nothing else.
  for (const { id, input, expectedOutput, metadata, status } of held) {
    if (!wanted.has(id) && status !== "ARCHIVED")
      await put({ id, input, expectedOutput, metadata, status: "ARCHIVED" });
  }
  return changed ? (await client.dataset.get(name)).items : held;
}

export function langfuse({
  url,
  publicKey,
  secretKey,
}: Omit<Settings, "commit">): Langfuse {
  const keys = { publicKey, secretKey, baseUrl: url };

  async function run(
    client: LangfuseClient,
    items: Held,
    experiment: Experiment,
  ): Promise<Sent> {
    const outputs = new Map(
      experiment.outputs.map(({ item, output }) => [item, output]),
    );
    const { datasetRunUrl } = await client.experiment.run({
      name: experiment.name,
      runName: experiment.run,
      metadata: experiment.metadata,
      // An experiment has the items of the runs that were made, and no other.
      data: items.filter((item) => outputs.has(item.id)),
      // The run is made already. A task that throws loses its trace, so the
      // error of a run that did not finish goes on the trace, and is given back.
      task: async (item) => {
        const output = "id" in item ? outputs.get(item.id) : undefined;
        if (output && "error" in output)
          updateActiveObservation({
            level: "ERROR",
            statusMessage: output.error,
          });
        return output;
      },
    });
    return {
      agent: experiment.agent,
      run: experiment.run,
      ...(datasetRunUrl && { url: datasetRunUrl }),
    };
  }

  return {
    async up() {
      try {
        return (
          await fetch(`${url}/api/public/health`, {
            signal: AbortSignal.timeout(3000),
          })
        ).ok;
      } catch {
        return false;
      }
    },
    async send({ dataset, experiments }) {
      const client = new LangfuseClient(keys);
      const tracing = new NodeSDK({
        spanProcessors: [new LangfuseSpanProcessor(keys)],
      });
      try {
        const items = await mirror(client, dataset);
        tracing.start();
        const sent: Sent[] = [];
        for (const experiment of experiments)
          sent.push(await run(client, items, experiment));
        return sent;
      } catch (error) {
        throw new Error(
          `Langfuse did not take the runs: ${(error as Error).message}`,
          { cause: error },
        );
      } finally {
        // The shutdown sends the traces that wait. It leaves the provider on
        // the globals of OpenTelemetry, and a later send would export nothing.
        await tracing.shutdown();
        trace.disable();
        context.disable();
        propagation.disable();
      }
    },
  };
}
