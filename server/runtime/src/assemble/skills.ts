/**
 * Skills: a plugin's written guides, read by id. Shared by every config,
 * since a skill is read the same way however the agent found it.
 */

import { tool, type StructuredTool } from "langchain";
import * as z from "zod";
import { OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../access/catalog.js";
import { READ_SKILL, READ_SKILL_DESCRIPTION } from "./names.js";

function readSkill(catalog: Catalog): StructuredTool {
  const skills = new Map(
    catalog.flatMap(({ plugin }) =>
      plugin.skills.map((s) => [s.name, s] as const),
    ),
  );
  return tool(
    async ({ id }) => {
      const skill = skills.get(id);
      if (!skill) throw new OpFailed(`no skill "${id}"`);
      return skill.body;
    },
    {
      name: READ_SKILL,
      description: READ_SKILL_DESCRIPTION,
      schema: z.object({
        id: z.string().describe("Skill id, e.g. odoo-lookup-company"),
      }),
    },
  );
}

/** read_skill, or nothing when no plugin has a skill. */
export function skillTools(catalog: Catalog): StructuredTool[] {
  return catalog.some(({ plugin }) => plugin.skills.length)
    ? [readSkill(catalog)]
    : [];
}
