/**
 * What a case is: one behaviour of one capability, written down so it can be
 * checked. A case is data about a package. No agent is given one, so the
 * harness reads none.
 */

import { NAME, type PackageDefinition } from "./package-spec.js";

export type Case = {
  name: string;
  /** The capability of its package that this case is about. */
  capability: string;
  /** What the user says. */
  input: string;
  /** What is true before the run. */
  start: string;
  /** One statement that is true or false after the run. */
  good: string;
};

const FIELDS = ["name", "capability", "input", "start", "good"];

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
  const problems: string[] = [];
  const capabilities = new Set(definition.capabilities.map((c) => c.name));
  const seen = new Set<string>();

  for (const c of cases as Record<string, unknown>[]) {
    const id = typeof c.name === "string" && c.name.trim() ? c.name : "";
    const of = id ? `case ${id}` : `a case in package ${definition.name}`;

    for (const field of Object.keys(c)) {
      if (!FIELDS.includes(field))
        problems.push(`${of} has a field "${field}"`);
    }
    for (const field of FIELDS) {
      const value = c[field];
      if (value === undefined || (typeof value === "string" && !value.trim()))
        problems.push(`${field} of ${of} is missing`);
      else if (typeof value !== "string")
        problems.push(`${field} of ${of} must be text`);
    }
    if (id) {
      if (!NAME.test(id)) problems.push(`case name "${id}" must match ${NAME}`);
      if (seen.has(id)) problems.push(`case name "${id}" is used twice`);
      seen.add(id);
    }
    if (typeof c.capability === "string" && c.capability.trim()) {
      if (!capabilities.has(c.capability))
        problems.push(
          `${of} names the capability "${c.capability}", which package ${definition.name} does not have`,
        );
    }
  }

  if (problems.length)
    throw new Error(
      `cases of package ${definition.name} are invalid:\n- ${problems.join("\n- ")}`,
    );
}
