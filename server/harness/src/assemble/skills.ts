/**
 * Skills: a package's written guides, read by id. Shared by every config,
 * since a skill is read the same way however the agent found it.
 */

import { tool, type StructuredTool } from "langchain";
import * as z from "zod";
import type { Skill } from "@que/core";
import type { Catalog } from "../access/catalog.js";

export const READ_SKILL = "read_skill";

/** A skill in one line, the way a list of skills shows it. */
export const skillLine = (s: Skill) =>
  `- ${s.id}: ${s.title}. ${s.description}`;

function readSkill(catalog: Catalog): StructuredTool {
  const skills = new Map(
    catalog.flatMap(({ pkg }) => pkg.skills.map((s) => [s.id, s] as const)),
  );
  return tool(
    async ({ id }) => skills.get(id)?.body ?? `Error: no skill "${id}"`,
    {
      name: READ_SKILL,
      description:
        "Read Skill: returns the full text of a skill, by its id, as the prompt or open_package lists it.",
      schema: z.object({
        id: z.string().describe("Skill id, e.g. odoo/lookup-company"),
      }),
    },
  );
}

/** read_skill, or nothing when no package has a skill. */
export function skillTools(catalog: Catalog): StructuredTool[] {
  return catalog.some(({ pkg }) => pkg.skills.length)
    ? [readSkill(catalog)]
    : [];
}
