/**
 * What a case is: one behaviour of one capability, written down so it can be checked. A case is a node, given in a
 * plugin's `cases.ts` beside its definition; no agent is given one. Its capability is a link, so the plugin that holds
 * that capability is the case's, in the graph.
 */

import type * as z from "zod";
import { faults, refuse } from "./check.ts";
import { plugin } from "./schema.ts";

/**
 * One case: its name, the behaviour it shows (its description), the capability it is about, what the user says, what
 * is true before the run, and one statement that is true or false after it.
 */
export type Case = z.output<typeof plugin.types.case.schema>;

/**
 * A plugin's cases, each parsed with the case type, once. Throws one error that lists every fault, each after the case
 * it is in. Its capability is the lint's to resolve.
 */
export function defineCases(cases: Case[]): Case[] {
  const read = readCases(cases);
  refuse("cases are invalid", read.faults);
  return read.cases;
}

/**
 * What a plugin's cases module gives as its default export, read as its cases: each parsed with the case type, or
 * each fault, after the case it is in. By its shape, not by which copy of this package made it.
 */
export function readCases(value: unknown): { cases: Case[]; faults: string[] } {
  if (!Array.isArray(value)) return { cases: [], faults: ["must be an array"] };
  const found = value.flatMap((kase: { name?: unknown } | undefined, i) =>
    faults(plugin.types.case.schema, kase).map(
      (fault) =>
        `${typeof kase?.name === "string" && kase.name.trim() ? kase.name : i} ${fault}`,
    ),
  );
  return found.length
    ? { cases: [], faults: found }
    : {
        cases: value.map((kase) => plugin.types.case.schema.parse(kase)),
        faults: [],
      };
}
