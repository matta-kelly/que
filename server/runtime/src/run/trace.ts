/**
 * The trace of a run, sent to Langfuse. The one file that names Langfuse.
 *
 * A deployment turns it on with three settings in its `.env`: the two keys and
 * the URL of its Langfuse. With none of them, que sends nothing and a run gets
 * the agent as it was built. A Langfuse that refuses a trace or cannot be
 * reached never stops a run: the SDK sends in the background.
 */

import { CallbackHandler } from "@langfuse/langchain";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { isRun } from "./chats.js";

export type Settings = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  /** The commit que runs from. */
  release?: string;
};

/** What a trace says of its run. */
export type Run = { user?: string; thread?: string; agent: string };

type Env = Record<string, string | undefined>;

// In the order the error names them.
const SETTINGS = [
  ["LANGFUSE_PUBLIC_KEY", "publicKey"],
  ["LANGFUSE_SECRET_KEY", "secretKey"],
  ["LANGFUSE_BASE_URL", "baseUrl"],
] as const;

/**
 * The Langfuse settings of the environment, or undefined with none of the
 * three. One or two of the three is a mistake in the `.env`, and throws. The
 * URL has no default: a line left out must not send a run to Langfuse's cloud.
 */
export function settingsFor(env: Env): Settings | undefined {
  const missing = SETTINGS.filter(([name]) => !env[name]).map(([name]) => name);
  if (missing.length === SETTINGS.length) return undefined;
  if (missing.length > 0)
    throw new Error(
      `trace: missing ${missing.join(", ")}. Set the two keys and the URL, or none of them`,
    );
  const settings = Object.fromEntries(
    SETTINGS.map(([name, key]) => [key, env[name]]),
  ) as Settings;
  if (env.QUE_COMMIT) settings.release = env.QUE_COMMIT;
  return settings;
}

/** What the trace of this call says, or undefined when the call is not a run. */
export function runOf(
  config: { configurable?: Record<string, unknown> } | undefined,
  runtime: { accessContext?: string } | undefined,
  agent: { name: string },
): Run | undefined {
  if (!isRun(runtime)) return undefined;
  const { langgraph_auth_user_id: user, thread_id: thread } =
    config?.configurable ?? {};
  return {
    ...(typeof user === "string" && { user }),
    ...(typeof thread === "string" && { thread }),
    agent: agent.name,
  };
}

/**
 * Starts the sending, one time, and gives back `traced`: it puts the trace of
 * a run on an agent. The LangGraph server runs the agent itself and passes no
 * handler of que's, so the handler goes on the agent with `withConfig`.
 */
export function startTracing(settings: Settings | undefined) {
  if (settings)
    new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor(settings)],
    }).start();

  return function traced<
    A extends { withConfig(config: { callbacks: CallbackHandler[] }): unknown },
  >(agent: A, run: Run | undefined): A | ReturnType<A["withConfig"]> {
    if (!settings || !run) return agent;
    const handler = new CallbackHandler({
      userId: run.user,
      sessionId: run.thread,
      traceMetadata: { agent: run.agent },
    });
    return agent.withConfig({
      callbacks: [handler],
    }) as ReturnType<A["withConfig"]>;
  };
}
