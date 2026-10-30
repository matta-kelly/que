/**
 * que's catalog as a pi Extension, for one user, with no name: the Harness names one for each conversation. Each op is
 * a tool whose run is one call to the door, as that user, and each skill is read by its tool. The agent's way says
 * when the model is offered an op: eager's from the first request; on-demand's once the agent has loaded it with
 * load_operation, which pi records on the conversation's branch (pi-durable's deferred tools), so the op stays offered
 * at each later request of that chat, after a compaction and after a restart.
 */

import type { Context } from "@earendil-works/chord/context";
import type {
  Extension,
  ToolExecutionApi,
  ToolExecutionResult,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import type { TSchema } from "@earendil-works/pi-ai";
import * as z from "zod";
import { OpFailed } from "@mku1tra/que-plugin";
import type { ResolvedLoop } from "@mku1tra/que-harness";
import type { Catalog } from "../../access/catalog.js";
import { strictInput, type Call } from "../../assemble/door.js";
import {
  LOAD_OPERATION,
  OPEN_PLUGIN,
  READ_SKILL,
  readSkillDescription,
} from "../../assemble/names.js";
import {
  load,
  LOAD_DESCRIPTION,
  loadSchema,
  open,
  openDescription,
  openSchema,
  reach,
} from "../../assemble/on-demand/open.js";
import type { Way } from "../../assemble/way.js";
import { attachmentTools, type Attachments } from "./attachments.js";
import { answered, failed, isStop } from "./repeat.js";
import {
  moved,
  READ_RESULT,
  READ_RESULT_DESCRIPTION,
  readResultSchema,
  WINDOW,
  windowAt,
} from "./result.js";

/** A schema's input side as JSON Schema, which pi-ai takes as it is (no TypeBox kind). */
const schemaOf = (schema: z.core.$ZodType) =>
  z.toJSONSchema(schema, { io: "input" }) as unknown as TSchema;

/** The details of a tool result that a bug made, and not the call. */
const BUG = { que: "bug" } as const;

/** Whether a tool result's details say a bug made it. */
export const isBug = (details: unknown) =>
  typeof details === "object" &&
  details !== null &&
  "que" in details &&
  details.que === BUG.que;

/** Whether a tool result's details say the run ends on it: a bug, or the repeat guard's stop. */
export const endsRun = (details: unknown) => isBug(details) || isStop(details);

/**
 * A tool's run, the call of `name` with `args`, as its result: its text for the model, or a failed call with an
 * OpFailed's text, which the repeat guard may turn into a stop. Any other throw is a bug: the result holds none of its
 * text (the door's span records it), and ends the run with no other model request.
 */
async function result(
  name: string,
  args: unknown,
  run: () => Promise<string>,
  api: ToolExecutionApi,
  context: Context,
): Promise<ToolExecutionResult> {
  const call = `${name}(${JSON.stringify(args)})`;
  try {
    const text = await run();
    await answered(call, api, context);
    return { output: [{ type: "text", text }] };
  } catch (error) {
    if (error instanceof OpFailed)
      return failed(call, error.message, api, context);
    return {
      isError: true,
      output: [{ type: "text", text: "the tool failed" }],
      details: BUG,
      control: { terminate: true },
    };
  }
}

export function extension(
  catalog: Catalog,
  call: Call,
  user: string,
  way: Way,
  // A loop that leaves it out, as the tests of other behaviors do, moves no result.
  limit: ResolvedLoop["result"] = false,
  // The run's thread's files: without them, as the tests of other behaviors leave them, there are no attachment tools.
  attachments: Attachments | undefined = undefined,
): Omit<Extension, "name"> {
  const ops = catalog.flatMap(({ plugin: { definition } }) =>
    definition.ops.map((op): ToolRegistration => ({
      name: op.name,
      description: `${op.title}: ${op.description}`,
      // The input side of the op's input (a transform shows what goes in, a default is not required), with no other
      // fields. pi checks the arguments against it and hands them on as they are, so the door is the one parse.
      parameters: schemaOf(strictInput(op.input)),
      ...(way.deferred ? { deferred: true as const } : {}),
      // pi cuts a tool's output at 50KB or 2000 lines by default: an op's is cut by nothing, so result.max alone decides.
      outputLimits: { maxBytes: Infinity, maxLines: Infinity },
      execute: async (args, api, context) => {
        const answer = await result(
          op.name,
          args,
          async () =>
            // An op that gives back nothing gives the JSON text null.
            JSON.stringify(
              await call(
                { plugin: definition.plugin, op },
                args,
                user,
                attachments,
              ),
            ) ?? "null",
          api,
          context,
        );
        // Then, a result over result.max is moved to its file, and the model gets the pointer.
        return limit ? moved(answer, limit.max, api, context) : answer;
      },
    })),
  );
  const skills = new Map(
    catalog.flatMap(({ plugin }) =>
      plugin.skills.map((s) => [s.name, s] as const),
    ),
  );
  const readSkill: ToolRegistration = {
    name: READ_SKILL,
    // On-demand lists a skill in open_plugin too; eager only in the prompt.
    description: readSkillDescription(way.deferred),
    parameters: schemaOf(
      z.strictObject({
        id: z.string().describe("Skill id, e.g. odoo-lookup-company"),
      }),
    ),
    execute: (args, api, context) =>
      result(
        READ_SKILL,
        args,
        async () => {
          const { id } = args as { id: string };
          const skill = skills.get(id);
          if (!skill) throw new OpFailed(`no skill "${id}"`);
          return skill.body;
        },
        api,
        context,
      ),
  };
  return {
    tools: [
      ...(way.deferred ? onDemand(catalog) : []),
      ...ops,
      ...(skills.size ? [readSkill] : []),
      ...(limit ? [readResult] : []),
      ...(attachments ? attachmentTools(attachments) : []),
    ],
  };
}

/** The model reads back a result that was moved to its file. Any other tool of files would be one no config chose. */
const readResult: ToolRegistration = {
  name: READ_RESULT,
  description: READ_RESULT_DESCRIPTION,
  parameters: schemaOf(readResultSchema),
  // A window is at most WINDOW bytes, of any number of lines.
  outputLimits: { maxBytes: WINDOW, maxLines: Infinity },
  execute: (args, api, context) =>
    result(
      READ_RESULT,
      args,
      async () =>
        windowAt(args as z.infer<typeof readResultSchema>, api, context),
      api,
      context,
    ),
};

/**
 * The tools to open a plugin and to load an op, for the ones the catalog holds something for. A load that succeeds
 * has pi offer the op from the next request.
 */
function onDemand(catalog: Catalog): ToolRegistration[] {
  const { open: opens, load: loads } = reach(catalog);
  if (!opens) return [];
  const openPlugin: ToolRegistration = {
    name: OPEN_PLUGIN,
    description: openDescription(loads),
    parameters: schemaOf(openSchema),
    execute: (args, api, context) =>
      result(
        OPEN_PLUGIN,
        args,
        async () => open(catalog, (args as { plugin: string }).plugin),
        api,
        context,
      ),
  };
  const loadOperation: ToolRegistration = {
    name: LOAD_OPERATION,
    description: LOAD_DESCRIPTION,
    parameters: schemaOf(loadSchema),
    execute: async (args, api, context) => {
      const { plugin, operation } = args as z.infer<typeof loadSchema>;
      const loaded = await result(
        LOAD_OPERATION,
        args,
        async () => load(catalog, plugin, operation),
        api,
        context,
      );
      return loaded.isError
        ? loaded
        : { ...loaded, control: { addTools: [operation] } };
    },
  };
  return loads ? [openPlugin, loadOperation] : [openPlugin];
}
