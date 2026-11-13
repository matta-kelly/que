/**
 * The door: every call of an op goes through `call(op, params, user)`. It hides how an op gets its input, its context
 * and its login, and where it runs.
 */

import { OpFailed, type Op, type Plugin } from "@mku1tra/que-plugin";
import * as z from "zod";
import type { Connect } from "../access/access.js";

/** An op, with the plugin that holds it. Its plugin decides its kind, so either context is here. */
export type PlacedOp = {
  plugin: Plugin;
  op: Op | Op<unknown, z.ZodObject, "domain">;
};

/** One call of an op, as one user: what the op's run gives back, or the OpFailed it throws. */
export type Call = (
  op: PlacedOp,
  params: unknown,
  user: string,
) => Promise<unknown>;

/**
 * An op's input with no other fields allowed: what the door parses and the tool shows. Made as zod's own `.strict()`
 * makes it, so it works for an input made with zod or with zod/mini. Inside a nested object, zod's own rule holds.
 */
export function strictInput(input: Op["input"]): Op["input"] {
  return z.core.clone(input, { ...input._zod.def, catchall: z.never() });
}

/** One line, for the model to read. */
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ");

/**
 * A connector op's own refusal, as the caller gets it: the connector's name first, once, and the plugin's text after it.
 * Text that already names the connector, its name as a word in any case, keeps its text. A domain op's, or a throw that
 * is no OpFailed, passes as it is.
 */
function namedBy(plugin: Plugin, error: unknown): unknown {
  if (plugin.kind === "domain" || !(error instanceof OpFailed)) return error;
  const names = new RegExp(
    `^${plugin.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i",
  );
  const message = names.test(error.message)
    ? error.message
    : `${plugin.name}: ${error.message}`;
  return new OpFailed(message, { cause: error });
}

/**
 * The door, on access asked by op and the mounted ops: its `call`. A domain op's context is the ops it lists in `uses`,
 * each bound to that op and the calling user; a connector op's is its connection. An op that needs approval is refused
 * after its input is parsed and before its connection or listed ops are made: no caller of the door can give a yes.
 */
export function door(connect: Connect, ops: PlacedOp[] = []): Call {
  async function invoke(
    { plugin, op }: PlacedOp,
    params: unknown,
    user: string,
    gate = true,
  ): Promise<unknown> {
    // The door is the one parse. Extra arguments are refused, as the shown schema says there are none.
    // A refine or a transform that throws is a failed parse too, with the throw's message.
    let parsed;
    try {
      parsed = await z.safeParseAsync(strictInput(op.input), params);
    } catch (thrown) {
      throw new OpFailed(
        oneLine(
          `invalid ${op.name} input: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
        ),
      );
    }
    if (!parsed.success)
      throw new OpFailed(
        oneLine(
          `invalid ${op.name} input: ${parsed.error.issues
            .map(({ path, message }) =>
              [...path.map(String), message].join(": "),
            )
            .join("; ")}`,
        ),
      );
    const input = parsed.data;
    // A call that needs approval does not run: an op whose approval has a `when` is refused only for the calls it names.
    // A call an op makes through `uses` is not gated: the op that made it was.
    if (gate && op.approval) {
      const when = op.approval === true ? undefined : op.approval.when;
      if (!when || (await when(input)))
        throw new OpFailed(
          `${op.name} needs approval, and it cannot be approved over MCP: the call did not run`,
        );
    }
    let ctx;
    if (plugin.kind === "domain") {
      ctx = { ops: listedBy(op, user) };
    } else {
      const connection = await connect(plugin, op.role, user);
      ctx = { conn: connection?.conn };
    }
    try {
      return await (
        op.run as (ctx: unknown, params: unknown) => Promise<unknown>
      )(ctx, input);
    } catch (error) {
      throw namedBy(plugin, error);
    }
  }

  // The ops a domain op lists, each the door bound to it and the calling user: found among every mounted op.
  function listedBy(op: PlacedOp["op"], user: string) {
    return Object.fromEntries(
      (op.uses ?? []).map((name) => [
        name,
        (params: unknown) =>
          invoke(
            ops.find((placed) => placed.op.name === name)!,
            params,
            user,
            false,
          ),
      ]),
    );
  }

  return (op, params, user) => invoke(op, params, user);
}
