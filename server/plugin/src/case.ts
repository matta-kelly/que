/**
 * What a case is: one behaviour of one capability, written down so it can be
 * checked. A case is data about a plugin, on its card: mount reads it with
 * the definition, and no agent is given one.
 */

import * as z from "zod";
import { check, once, strict } from "./check.ts";
import type { Plugin } from "./contract.ts";
import { fieldsOf, standardName, text } from "./fields.ts";
import { plugin } from "./schema.ts";

const types = plugin.types;

/**
 * One case: its name, which is its node's in the whole graph, the behaviour it shows, and the case's fields: the
 * capability of its plugin it is about, what the user says, what is true before the run, and one statement that is true
 * or false after it.
 */
export const Case = z.strictObject(
  {
    name: standardName,
    /** The behaviour it shows, in one line. */
    description: text,
    ...fieldsOf(types.case),
  },
  strict(),
);

export type Case = z.infer<typeof Case>;

export function defineCases(cases: Case[]): Case[] {
  return cases;
}

/**
 * Check the cases of a plugin against the contract, throwing one error that
 * lists every problem. A plugin's own test calls this, as it calls
 * `validatePlugin`.
 */
export function validateCases(definition: Plugin, cases: Case[]): void {
  const capabilities = new Set(definition.capabilities.map((c) => c.name));
  const known = fieldsOf(types.case).capability.refine(
    (capability) => !capability.trim() || capabilities.has(capability),
    {
      error: (issue) =>
        `names "${String(issue.input)}", which plugin ${definition.name} does not have`,
    },
  );
  check(
    z
      .array(Case.extend({ capability: known }))
      .superRefine(once((c) => c.name)),
    cases,
    `cases of plugin ${definition.name} are invalid`,
  );
}
