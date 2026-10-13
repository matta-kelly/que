/**
 * Skills: a package's written guides, read by id. Shared by every config,
 * since a skill is read the same way however the agent found it.
 */

import { tool, type StructuredTool } from "langchain";
import * as z from "zod";
import type { Catalog } from "../access/catalog.js";

export const READ_SKILL = "read_skill";

function readSkill(catalog: Catalog): StructuredTool {
  const skills = new Map(
    catalog.flatMap(({ pkg }) => pkg.skills.map((s) => [s.id, s] as const)),
  );
  return tool(
    async ({ id }) => skills.get(id)?.body ?? `Error: no skill "${id}"`,
    {
      name: READ_SKILL,
      description:
        "Read Skill: returns the full text of a skill, by the id open_package lists it under.",
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
