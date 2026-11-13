/**
 * The skills one MCP session serves: the skills of each plugin in the user's catalog, by the MCP skills extension
 * (SEP-2640), and for a client that does not have the extension, as resources the server instructions point to.
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

/** The server instructions: how to use a skill, then one line for each skill. None when the session serves none. */
export function skillsLine(served: ServedSkill[]): string | undefined {
  if (!served.length) return undefined;
  return [
    "This server gives skills: how this business does a task with these tools.",
    "Before you do a task that a skill covers, read its SKILL.md (resources/read on its URI) and do what it says.",
    "The skills:",
    ...served.map(
      (skill) => `- ${skill.name}: ${skill.description} (${skill.uri})`,
    ),
  ].join("\n");
}
