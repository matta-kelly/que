/**
 * The door: every call of an op goes through `call(op, params, user)`. It hides how an op gets its input, its context
 * and its login, and where it runs.
 */

import {
  context,
  SpanStatusCode,
  trace,
  type Context,
} from "@opentelemetry/api";
import {
  OpFailed,
  type Op,
  type OpFiles,
  type Plugin,
} from "@mku1tra/que-plugin";
import type { FileStore } from "@que/files";
import * as z from "zod";
import type { Connect } from "../access/access.js";

const tracer = trace.getTracer("que");

/** The login an op runs on, on its span: `own`, a role's name, or none for a domain op. */
const LOGIN = "que.login";

/** An op, with the plugin that holds it. Its plugin decides its kind, so either context is here. */
export type PlacedOp = {
  plugin: Plugin;
  op: Op | Op<unknown, z.ZodObject, "domain">;
};

/** The run's files a call is scoped to: the store, and the run's thread. */
export type FilesScope = { files: FileStore; thread: string };

/** The question the door asks before a flagged op runs: the op, and its parsed input. */
export type Ask = (op: PlacedOp, input: unknown) => Promise<boolean>;

/** One call of an op, as one user and the run's thread's files: what the op's run gives back, or the OpFailed it throws. */
export type Call = (
  op: PlacedOp,
  params: unknown,
  user: string,
  files?: FilesScope,
) => Promise<unknown>;

/** The door's call bound to one user, as a run hands it to its tools. */
export type BoundCall = (op: PlacedOp, params: unknown) => Promise<unknown>;

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

/** The run thread's files, by the thread's own: an id of another thread is an OpFailed that names it, never a path. */
function filesOf({ files, thread }: FilesScope): OpFiles {
  return {
    async get(id) {
      const file = await files.get(thread, id);
      if (!file)
        throw new OpFailed(
          `no file ${id} in thread ${thread}: it is not one of this thread's attachments`,
        );
      return file;
    },
    list: () => files.list(thread),
  };
}

/**
 * The door, on access asked by op and the mounted ops: its `call`. A domain op's context is the ops it lists in `uses`,
 * each bound to that op and the calling user; a connector op's is its connection. An op that needs a yes is asked
 * after its input is parsed and before its connection or listed ops are made.
 */
export function door(connect: Connect, ops: PlacedOp[] = [], ask?: Ask): Call {
  // One span per call, named by the op. An OpFailed from run, or from access, is thrown on as it is, and recorded on
  // the span. A nested call names its caller's span as its parent, so it sits under the call that made it.
  function call(
    { plugin, op }: PlacedOp,
    params: unknown,
    user: string,
    files?: FilesScope,
    parent?: Context,
    gate = true,
  ): Promise<unknown> {
    return tracer.startActiveSpan(
      op.name,
      {},
      parent ?? context.active(),
      async (span) => {
        try {
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
          if (gate && op.approval) {
            if (!ask)
              throw new OpFailed(
                `${op.name} needs a yes, and this run has no way to ask: the call did not run`,
              );
            if (!(await ask({ plugin, op }, input)))
              throw new OpFailed(
                `${op.name}: the user declined: the call did not run`,
              );
          }
          const scope = files ? { files: filesOf(files) } : {};
          let ctx;
          if (plugin.kind === "domain") {
            ctx = {
              ...scope,
              ops: listedBy(
                op,
                user,
                files,
                trace.setSpan(context.active(), span),
              ),
            };
          } else {
            const connection = await connect(plugin, op.role, user);
            if (connection) span.setAttribute(LOGIN, connection.login);
            ctx = { ...scope, conn: connection?.conn };
          }
          try {
            return await (
              op.run as (ctx: unknown, params: unknown) => Promise<unknown>
            )(ctx, input);
          } catch (error) {
            throw namedBy(plugin, error);
          }
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
      },
    );
  }

  // The ops a domain op lists, each the door bound to it and the calling user: found among every mounted op, as an
  // agent config can narrow the catalog to the domain alone.
  function listedBy(
    op: PlacedOp["op"],
    user: string,
    files: FilesScope | undefined,
    parent: Context,
  ) {
    return Object.fromEntries(
      (op.uses ?? []).map((name) => [
        name,
        (params: unknown) =>
          call(
            ops.find((placed) => placed.op.name === name)!,
            params,
            user,
            files,
            parent,
            false,
          ),
      ]),
    );
  }

  return call;
}
