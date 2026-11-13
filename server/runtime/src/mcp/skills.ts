/**
 * The skills one MCP session serves: the skills of each plugin in the user's catalog. Each skill is a tool, the one
 * channel every client gives its model, and the server instructions say to call it before a task it covers. The MCP
 * skills extension (SEP-2640) and resources serve the same files to a client that reads them.
 */

import type { SkillSource } from "@modelcontextprotocol/server/ext/skills";
import type { ServedSkill } from "../mount/skills.js";

/** The source the skills extension serves: these skills, each listed, got and read by its URI. */
export function skillSource(served: ServedSkill[]): SkillSource {
  const byUri = new Map(served.map((skill) => [skill.uri, skill]));
  return {
    // A session serves a few skills: one page holds them all.
    list: async () => ({ skills: served.map((skill) => skill.entry) }),
    get: async (uri) => byUri.get(uri)?.entry,
    read: async (uri) => {
      const skill = byUri.get(uri);
      return skill && { text: skill.text, mimeType: "text/markdown" };
    },
    // resources/list gives each SKILL.md, so a client without the extension finds and reads them as resources.
    listResources: async () =>
      served.map((skill) => ({
        uri: skill.uri,
        name: skill.name,
        title: skill.title,
        description: skill.description,
        mimeType: "text/markdown",
        size: skill.size,
      })),
  };
}

/** The line a skill's tool description ends with: what calling it gives, and that it comes before the task. */
export const SKILL_LINE =
  "A skill: this business's playbook for that task. Call it before you do the task, and do what it says.";

/** One skill as a tool: named as the skill, described by its description, and a call gives its SKILL.md. */
export type SkillTool = { name: string; description: string; text: string };

/** The tools these skills give, one per skill. */
export function skillTools(served: ServedSkill[]): SkillTool[] {
  return served.map((skill) => ({
    name: skill.name,
    description: `${skill.description}\n\n${SKILL_LINE}`,
    text: skill.text,
  }));
}

/** The server instructions: that the skills come first, then one line for each skill. None when the session serves none. */
export function skillsLine(served: ServedSkill[]): string | undefined {
  if (!served.length) return undefined;
  return [
    "This server is this business's playbooks (skills) and the ops they use.",
    "Before any task, call the skill tool that covers it, and do what it says. Use the ops as the skill directs.",
    "The skills:",
    ...served.map((skill) => `- ${skill.name}: ${skill.description}`),
  ].join("\n");
}
