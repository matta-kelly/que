/**
 * The trace of a run, sent to Langfuse. The one file that names Langfuse or
 * an OpenTelemetry SDK.
 *
 * A deployment turns it on with three settings in its `.env`: the two keys and
 * the URL of its Langfuse. With none of them, que sends nothing and a run gets
 * the agent as it was built. A Langfuse that refuses a trace or cannot be
 * reached never stops a run: the SDK sends in the background.
 *
 * A run on LangGraph is traced by Langfuse's LangChain handler (`traced`). A
 * run on pi is traced by pi's own spans, on OpenTelemetry (`tracingOnPi`): each
 * request and answer, and each tool call with its arguments and its result,
 * come from pi's hooks, and a tool's span is the active one while the tool
 * runs, so a span the door or a plugin opens is under it.
 */

import {
  GenerationTask,
  hook,
  ToolTask,
  type HookRegistration,
} from "@earendil-works/pi-durable";
import type {
  SpanStatus,
  TelemetryContext,
  TelemetryPropagation,
  TelemetrySpan,
} from "@earendil-works/pi-telemetry";
import { CallbackHandler } from "@langfuse/langchain";
import { isDefaultExportSpan, LangfuseSpanProcessor } from "@langfuse/otel";
import {
  LangfuseOtelSpanAttributes as Langfuse,
  propagateAttributes,
} from "@langfuse/tracing";
import {
  context as otel,
  propagation,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
} from "@opentelemetry/api";
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

/** The attribute every span of a run on pi holds, from the run's context: its agent. */
const AGENT = `${Langfuse.TRACE_METADATA}.agent`;

/**
 * Starts the sending, one time. Langfuse's own spans and a model library's
 * are sent, and every span of a run on pi: pi's, que's, and a plugin's own
 * under them.
 */
function send(settings: Settings) {
  new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        ...settings,
        shouldExportSpan: ({ otelSpan }) =>
          isDefaultExportSpan(otelSpan) || AGENT in otelSpan.attributes,
      }),
    ],
  }).start();
}

/**
 * Starts the sending, one time, and gives back `traced`: it puts the trace of
 * a run on an agent. The LangGraph server runs the agent itself and passes no
 * handler of que's, so the handler goes on the agent with `withConfig`.
 */
export function startTracing(settings: Settings | undefined) {
  if (settings) send(settings);

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

const pi = trace.getTracer("pi");
const que = trace.getTracer("que");

/** The OpenTelemetry context of each of pi's spans: the one it started in, with it active. */
const contexts = new WeakMap<TelemetryContext, Context>();

/** A carrier is OpenTelemetry's, W3C's trace context and baggage: the baggage holds the run. */
const carriers: TelemetryPropagation = {
  inject(at) {
    const active = contexts.get(at);
    if (!active) return undefined;
    const carrier: Record<string, string> = {};
    propagation.inject(active, carrier);
    return carrier;
  },
  extract: (carrier) =>
    telemetryAt(propagation.extract(ROOT_CONTEXT, carrier ?? {})),
};

const statusOf = (status: SpanStatus) =>
  status.status === "ok"
    ? { code: SpanStatusCode.OK }
    : { code: SpanStatusCode.ERROR, message: status.error?.message };

/**
 * pi's telemetry on OpenTelemetry, with each span under `parent`. At the root,
 * the parent is the active context: the run's, when it submits its input.
 * While a span's callback runs, the span is the active one.
 */
function telemetryAt(parent?: Context): TelemetryContext {
  return {
    propagation: carriers,
    async startSpan(options, callback) {
      const at = parent ?? otel.active();
      const span = pi.startSpan(
        options.name,
        { attributes: options.attributes as Attributes },
        at,
      );
      const active = trace.setSpan(at, span);
      let statusSet = false;
      const handle: TelemetrySpan = {
        ...telemetryAt(active),
        addLink({ context, attributes }) {
          const target = contexts.get(context);
          if (target)
            span.addLink({
              context: trace.getSpanContext(target)!,
              attributes: attributes as Attributes,
            });
        },
        addEvent: (name, attributes) =>
          span.addEvent(name, attributes as Attributes),
        setAttributes: (attributes) =>
          span.setAttributes(attributes as Attributes),
        setStatus(status) {
          statusSet = true;
          span.setStatus(statusOf(status));
        },
      };
      contexts.set(handle, active);
      try {
        return await otel.with(active, () => callback(handle));
      } catch (error) {
        if (!statusSet) span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
  };
}

/** The span of pi's span `at`, in OpenTelemetry. */
const spanOf = (at: TelemetryContext) =>
  trace.getSpan(contexts.get(at) ?? ROOT_CONTEXT);

/** The model call each request phase has open, from its request to its answer. */
const generations = new WeakMap<TelemetryContext, Span>();

/** What a trace shows of pi's work: the content of each model call and each tool call, which pi's spans hold none of. */
const hooks: HookRegistration[] = [
  hook(GenerationTask, {
    beforeRequest({ messages }, _api, { telemetry }) {
      generations.set(
        telemetry,
        que.startSpan(
          "generation",
          {
            attributes: {
              [Langfuse.OBSERVATION_TYPE]: "generation",
              [Langfuse.OBSERVATION_INPUT]: JSON.stringify(messages),
            },
          },
          contexts.get(telemetry),
        ),
      );
    },
    afterResponse(message, _api, { telemetry }) {
      const generation = generations.get(telemetry);
      generation?.setAttribute(
        Langfuse.OBSERVATION_OUTPUT,
        JSON.stringify(message),
      );
      generation?.end();
    },
  }),
  // A tool call's span is the phase of pi's that runs it, named by the tool.
  hook(ToolTask, {
    beforeTool(call, _api, { telemetry }) {
      spanOf(telemetry)
        ?.updateName(call.name)
        .setAttributes({
          [Langfuse.OBSERVATION_TYPE]: "tool",
          [Langfuse.OBSERVATION_INPUT]: JSON.stringify(call.arguments),
        });
    },
    afterTool(_call, result, _api, { telemetry }) {
      spanOf(telemetry)?.setAttribute(
        Langfuse.OBSERVATION_OUTPUT,
        JSON.stringify(result),
      );
    },
  }),
];

/**
 * Starts the sending, one time, for runs on pi, and gives back what traces
 * them: the Harness's `telemetry`, the `hooks` of an extension, and `ofRun`,
 * in which a run submits its input, so the trace it starts holds the run's
 * user, thread and agent, in each of its spans. With no settings, nothing.
 */
export function tracingOnPi(settings: Settings | undefined) {
  if (!settings)
    return { hooks: [], ofRun: <T>(_run: Run, submit: () => T) => submit() };
  send(settings);
  return {
    telemetry: telemetryAt(),
    hooks,
    ofRun: <T>(run: Run, submit: () => T) =>
      propagateAttributes(
        {
          userId: run.user,
          sessionId: run.thread,
          metadata: { agent: run.agent },
          // In the baggage, so a carrier of pi's holds the run, and each span of the run has it.
          asBaggage: true,
        },
        submit,
      ),
  };
}
