/**
 * The door: every call of an op goes through `call(op, params, user)`. It hides how an op gets its input, its context
 * and its login, and where it runs.
 */

import { trace } from "@opentelemetry/api";
import type { Op, Plugin } from "@mku1tra/que-plugin";
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

/** The door, on access asked by op: its `call`. */
export function door(connect: Connect): Call {
  // One span per call, named by the op. An OpFailed from run, or from access, is thrown on as it is.
  return ({ plugin, op }, params, user) =>
    tracer.startActiveSpan(op.name, async (span) => {
      try {
        const input = op.input.parse(params);
        const conn = await connect(plugin, op.role, user);
        return await op.run({ conn }, input);
      } finally {
        span.end();
      }
    });
}
