/**
 * The names of que's own tools, read_skill's description, and the line a skill is listed by: what the prompts and the tools share, with no
 * LangChain, so both the LangGraph path and pi's take them.
 */

import type { Skill } from "@mku1tra/que-plugin";

export const READ_SKILL = "read_skill";
export const OPEN_PLUGIN = "open_plugin";
export const LOAD_OPERATION = "load_operation";

/** read_skill's description: a skill's id is in the prompt (eager) or in what open_plugin shows (on-demand). */
export const READ_SKILL_DESCRIPTION =
  "Read Skill: returns the full text of a skill, by its id, as the prompt or open_plugin lists it.";

/** A skill in one line, the way a list of skills shows it. */
export const skillLine = (s: Skill) =>
  `- ${s.name}: ${s.title}. ${s.description}`;
