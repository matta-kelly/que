/**
 * What a case is: one behaviour of one capability, written down so it can be
 * checked. A case is data about a package. No agent is given one, so the
 * harness reads none.
 */

import * as z from "zod";
import { check, name, once, strict, text } from "./check.js";
import type { PackageDefinition } from "./plugin.js";

export const Case = z.strictObject(
  {
    name,
    /** The capability of its package that this case is about. */
    capability: text,
    /** What the user says. */
    input: text,
    /** What is true before the run. */
    start: text,
    /** One statement that is true or false after the run. */
    good: text,
  },
  strict(),
);

export type Case = z.infer<typeof Case>;

export function defineCases(cases: Case[]): Case[] {
  return cases;
}

/**
 * Check the cases of a package against the contract, throwing one error that
 * lists every problem. A package's own test calls this, as it calls
 * `validatePackage`.
 */
export function validateCases(
  definition: PackageDefinition,
  cases: Case[],
): void {
  const capabilities = new Set(definition.capabilities.map((c) => c.name));
  const known = text.refine(
    (capability) => !capability.trim() || capabilities.has(capability),
    {
      error: (issue) =>
        `names "${String(issue.input)}", which package ${definition.name} does not have`,
    },
  );
  check(
    z
      .array(Case.extend({ capability: known }))
      .superRefine(once((c) => c.name)),
    cases,
    `cases of package ${definition.name} are invalid`,
  );
}
