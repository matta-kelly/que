/**
 * que's catalog as a pi Extension, for one user, with no name: the Harness names one for each conversation. Each op is
 * a tool whose run is one call to the door, as that user, and each skill is read by its tool. Every op is offered from
 * the first request.
 */

import type {
  Extension,
  ToolExecutionResult,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import type { TSchema } from "@earendil-works/pi-ai";
import * as z from "zod";
import { OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../../access/catalog.js";
import { strictInput, type Call } from "../../assemble/door.js";
import { READ_SKILL } from "../../assemble/names.js";

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

/**
 * A tool's run as its result: its text for the model, or a failed call with an OpFailed's text. Any other throw is a
 * bug: the result holds none of its text (the door's span records it), and ends the run with no other model request.
 */
async function result(
  run: () => Promise<string>,
): Promise<ToolExecutionResult> {
  try {
    return { output: [{ type: "text", text: await run() }] };
  } catch (error) {
    if (error instanceof OpFailed)
      return { isError: true, output: [{ type: "text", text: error.message }] };
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
  // The agent's way of loading (assemble/eager, assemble/on-demand): a stub, not read yet.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _way: { readonly name: string },
): Omit<Extension, "name"> {
  const ops = catalog.flatMap(({ plugin: { definition } }) =>
    definition.ops.map((op): ToolRegistration => ({
      name: op.name,
      description: `${op.title}: ${op.description}`,
      // The input side of the op's input (a transform shows what goes in, a default is not required), with no other
      // fields. pi checks the arguments against it and hands them on as they are, so the door is the one parse.
      parameters: schemaOf(strictInput(op.input)),
      execute: (args) =>
        result(
          async () =>
            // An op that gives back nothing gives the JSON text null.
            JSON.stringify(
              await call({ plugin: definition.plugin, op }, args, user),
            ) ?? "null",
        ),
    })),
  );
  const skills = new Map(
    catalog.flatMap(({ plugin }) =>
      plugin.skills.map((s) => [s.name, s] as const),
    ),
  );
  const readSkill: ToolRegistration = {
    name: READ_SKILL,
    description:
      "Read Skill: returns the full text of a skill, by its id, as the prompt lists it.",
    parameters: schemaOf(
      z.strictObject({
        id: z.string().describe("Skill id, e.g. odoo-lookup-company"),
      }),
    ),
    execute: (args) =>
      result(async () => {
        const { id } = args as { id: string };
        const skill = skills.get(id);
        if (!skill) throw new OpFailed(`no skill "${id}"`);
        return skill.body;
      }),
  };
  return { tools: skills.size ? [...ops, readSkill] : ops };
}
