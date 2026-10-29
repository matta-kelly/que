/**
 * The door: every call of an op goes through `call(op, params, user)`. It hides how an op gets its input, its context
 * and its login, and where it runs.
 */

import type { Op, Plugin } from "@mku1tra/que-plugin";
import type { Connect } from "../access/access.js";

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
  void connect;
  return async () => undefined; // stub: da-hammer builds it
}
