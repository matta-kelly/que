/**
 * Skills: a plugin's written guides, read by id. Shared by every config,
 * since a skill is read the same way however the agent found it.
 */

import { tool, type StructuredTool } from "langchain";
import * as z from "zod";
import { OperationFailed, type Skill } from "@que/core";
import type { Catalog } from "../access/catalog.js";

export const READ_SKILL = "read_skill";

/** A skill in one line, the way a list of skills shows it. */
export const skillLine = (s: Skill) =>
  `- ${s.id}: ${s.title}. ${s.description}`;

function readSkill(catalog: Catalog): StructuredTool {
  const skills = new Map(
    catalog.flatMap(({ plugin }) =>
      plugin.skills.map((s) => [s.id, s] as const),
    ),
  );
  return tool(
    async ({ id }) => {
      const skill = skills.get(id);
      if (!skill) throw new OperationFailed(`no skill "${id}"`);
      return skill.body;
    },
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

/** read_skill, or nothing when no plugin has a skill. */
export function skillTools(catalog: Catalog): StructuredTool[] {
  return catalog.some(({ plugin }) => plugin.skills.length)
    ? [readSkill(catalog)]
    : [];
}
