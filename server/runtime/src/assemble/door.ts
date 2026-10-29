/**
 * The door: every call of an op goes through `call(op, params, user)`. It hides how an op gets its input, its context
 * and its login, and where it runs.
 */

import { SpanStatusCode, trace } from "@opentelemetry/api";
import { OpFailed, type Op, type Plugin } from "@mku1tra/que-plugin";
import type { Connect } from "../access/access.js";

const tracer = trace.getTracer("que");

/** An op, with the plugin that holds it. */
export type PlacedOp = { plugin: Plugin; op: Op };

/** One call of an op, as one user: what the op's run gives back, or the OpFailed it throws. */
export type Call = (
  op: PlacedOp,
  params: unknown,
  user: string,
) => Promise<unknown>;

/** The door's call bound to one user, as a run hands it to its tools. */
export type BoundCall = (op: PlacedOp, params: unknown) => Promise<unknown>;

/** The door, on access asked by op: its `call`. */
export function door(connect: Connect): Call {
  // One span per call, named by the op. An OpFailed from run, or from access, is thrown on as it is, and recorded on
  // the span.
  return ({ plugin, op }, params, user) =>
    tracer.startActiveSpan(op.name, async (span) => {
      try {
        // The door is the one parse. Extra arguments are refused, as the shown schema says there are none.
        const parsed = op.input.strict().safeParse(params);
        if (!parsed.success)
          throw new OpFailed(
            `invalid ${op.name} input: ${parsed.error.issues
              .map(({ path, message }) =>
                [...path.map(String), message].join(": "),
              )
              .join("; ")
              .replace(/\s*\n\s*/g, " ")}`,
          );
        const input = parsed.data;
        const conn = await connect(plugin, op.role, user);
        return await op.run({ conn }, input);
      } catch (error) {
        // A failed call shows on its span: status ERROR, and the throw as an exception event.
        // A throw that is no Error is recorded as its text.
        const thrown = error instanceof Error ? error : String(error);
        span.recordException(thrown);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: typeof thrown === "string" ? thrown : thrown.message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
}
