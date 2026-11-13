/**
 * The skills a mounted plugin serves over MCP: each `SKILL.md` as the MCP skills extension (SEP-2640) publishes it, at
 * `skill://<plugin>/<skill>/SKILL.md`, made once at mount. The entry holds the file's frontmatter as written, its
 * sha256 digest and its size (skillEntry in @modelcontextprotocol/server), so a client can check what it reads. Only
 * `SKILL.md` is served: a skill holds all it needs in that one file (skill-contract).
 */

import { readFileSync } from "node:fs";
import {
  skillEntry,
  SkillCatalogError,
  type Skill as SkillEntry,
} from "@modelcontextprotocol/server/ext/skills";
import type { Skill } from "@mku1tra/que-plugin";

/** One skill as MCP serves it: its entry, its file's text, and what the server instructions and resources/list show. */
export type ServedSkill = {
  name: string;
  title: string;
  description: string;
  /** The URI of its `SKILL.md`. */
  uri: string;
  entry: SkillEntry;
  /** The file as written, so a read gives the bytes the entry's digest is of. */
  text: string;
  size: number;
};

/** The served skills of the plugin `plugin`, each read from the file `fileOf` names. A skill that breaks the extension's rules stops the mount. */
export async function servedSkills(
  plugin: string,
  skills: Skill[],
  fileOf: (skill: string) => string,
): Promise<ServedSkill[]> {
  return Promise.all(
    skills.map(async (skill) => {
      const bytes = readFileSync(fileOf(skill.name));
      let entry: SkillEntry;
      try {
        entry = await skillEntry(`${plugin}/${skill.name}`, {
          "SKILL.md": bytes,
        });
      } catch (error) {
        if (!(error instanceof SkillCatalogError)) throw error;
        throw new Error(
          `mount: the skill ${plugin}/${skill.name} cannot be served over MCP: ${error.message}`,
          { cause: error },
        );
      }
      return {
        name: skill.name,
        title: skill.title,
        description: skill.description,
        uri: entry.uri,
        entry,
        text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
        size: bytes.byteLength,
      };
    }),
  );
}
